/* The Fault Cam page's attestation record: the record view and the
   in-browser check. Node has WebCrypto Ed25519, so each case signs a
   real hash with a fresh key, the way the camera does (the signed
   message is the 32 raw digest bytes, service/src/crypto.ts). */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  bytesToHex,
  checkReserve,
  ed25519Supported,
  recordFor,
  sha256Hex,
  verifyFrame,
  VERDICT_TEXT,
} from "../src/scripts/attestation";
import { DARK, type Reserve } from "../src/scripts/camera-state";
import { DEVICE_PUBKEY } from "../src/config";

const subtle = globalThis.crypto.subtle;
const FRAME = new TextEncoder().encode("a cropped, EXIF-stripped still");

let pubHex = "";
let sha = "";
let sig = "";
let otherSig = "";

async function signWithNewKey(hashHex: string) {
  const pair = await subtle.generateKey({ name: "Ed25519" }, true, [
    "sign",
    "verify",
  ]);

  const raw = new Uint8Array(await subtle.exportKey("raw", pair.publicKey));
  const msg = Uint8Array.from(Buffer.from(hashHex, "hex"));
  const s = new Uint8Array(await subtle.sign("Ed25519", pair.privateKey, msg));
  return { pub: bytesToHex(raw), sig: bytesToHex(s) };
}

beforeAll(async () => {
  sha = await sha256Hex(FRAME, subtle);
  const a = await signWithNewKey(sha);
  pubHex = a.pub;
  sig = a.sig;
  otherSig = (await signWithNewKey(sha)).sig;
});

describe("verifyFrame", () => {
  it("verifies a frame signed over its hash", async () => {
    expect(await verifyFrame(FRAME, sha, sig, pubHex, subtle)).toBe("verified");
  });

  it("accepts an upper-case published hash", async () => {
    expect(
      await verifyFrame(FRAME, sha.toUpperCase(), sig, pubHex, subtle),
    ).toBe("verified");
  });

  it("reports a hash mismatch when the bytes differ from the record", async () => {
    const tampered = FRAME.slice();
    tampered[0] ^= 1;

    expect(await verifyFrame(tampered, sha, sig, pubHex, subtle)).toBe(
      "mismatch",
    );
  });

  it("reports an invalid signature from another key", async () => {
    expect(await verifyFrame(FRAME, sha, otherSig, pubHex, subtle)).toBe(
      "invalid",
    );
  });

  it("reports an invalid signature when the signature is tampered", async () => {
    const flipped = (sig.startsWith("0") ? "1" : "0") + sig.slice(1);

    expect(await verifyFrame(FRAME, sha, flipped, pubHex, subtle)).toBe(
      "invalid",
    );
  });

  it("reports malformed signature hex as invalid rather than throwing", async () => {
    expect(await verifyFrame(FRAME, sha, "zz", pubHex, subtle)).toBe("invalid");
  });
});

describe("DEVICE_PUBKEY", () => {
  it("is the key the Worker verifies with (service/wrangler.toml)", () => {
    const toml = readFileSync(
      fileURLToPath(new URL("../../service/wrangler.toml", import.meta.url)),
      "utf8",
    );

    expect(/^ED25519_PUBKEY\s*=\s*"([0-9a-f]{64})"/m.exec(toml)?.[1]).toBe(
      DEVICE_PUBKEY,
    );
  });
});

describe("ed25519Supported", () => {
  it("is true where WebCrypto imports an Ed25519 key", async () => {
    expect(await ed25519Supported(subtle, DEVICE_PUBKEY)).toBe(true);
  });

  it("is false when the import throws", async () => {
    const refusing = {
      importKey: () => Promise.reject(new Error("NotSupportedError")),
    } as unknown as SubtleCrypto;

    expect(await ed25519Supported(refusing, DEVICE_PUBKEY)).toBe(false);
  });

  it("is false with no WebCrypto at all", async () => {
    expect(await ed25519Supported(undefined, DEVICE_PUBKEY)).toBe(false);
  });
});

describe("checkReserve", () => {
  const live = (): Reserve => ({
    frameUrl: "/api/frame/9",
    counter: 9,
    ts: 1_790_000_000,
    sha256: sha,
    sig,
    croText: null,
    status: "fresh",
  });

  const serve = (bytes: Uint8Array, ok = true) =>
    (() =>
      Promise.resolve({
        ok,
        arrayBuffer: () => Promise.resolve(bytes.slice().buffer),
      } as Response)) as unknown as typeof fetch;

  it("dark: no frame to check, and nothing fetched", async () => {
    let fetched = false;

    const fetchImpl = (() => {
      fetched = true;
      return Promise.reject(new Error("no"));
    }) as unknown as typeof fetch;

    expect(await checkReserve(DARK, { fetchImpl, subtle, pubHex })).toBe(
      "dark",
    );

    expect(fetched).toBe(false);
  });

  it("verifies the served frame against the record", async () => {
    expect(
      await checkReserve(live(), { fetchImpl: serve(FRAME), subtle, pubHex }),
    ).toBe("verified");
  });

  it("fetches the frame the reading names, uncached", async () => {
    let seen: [unknown, RequestInit | undefined] | undefined;

    const fetchImpl = ((url: string, init?: RequestInit) => {
      seen = [url, init];
      return serve(FRAME)(url);
    }) as unknown as typeof fetch;

    await checkReserve(live(), { fetchImpl, subtle, pubHex });
    expect(seen?.[0]).toBe("/api/frame/9");
    expect(seen?.[1]?.cache).toBe("no-store");
  });

  /* Only a same-origin /api/frame/ path from the API body is fetched;
     anything else falls back to /latest. */
  it.each([
    ["no frameUrl", null],
    ["an absolute foreign URL", "https://evil.example/api/frame/9"],
    ["a protocol-relative URL", "//evil.example/api/frame/9"],
    ["a path outside /api/frame/", "/api/reserve"],
    ["a traversal", "/api/frame/../../admin"],
    ["an embedded scheme", "/api/frame/9?u=https://evil.example"],
  ])("fetches /api/frame/latest for %s", async (_name, frameUrl) => {
    const seen: unknown[] = [];

    const fetchImpl = ((url: string) => {
      seen.push(url);
      return serve(FRAME)(url);
    }) as unknown as typeof fetch;

    await checkReserve({ ...live(), frameUrl }, { fetchImpl, subtle, pubHex });
    expect(seen[0]).toBe("/api/frame/latest");
  });

  /* A mismatch is rechecked against a fresh /api/reserve before it is
     reported: KV is eventually consistent, so the record can name frame
     N+1 while /latest still serves N, or the frame can move between the
     two requests. */
  const routed = (
    frame: Uint8Array,
    reserve: () => Promise<Response>,
    seen: [string, RequestInit | undefined][] = [],
  ) =>
    ((url: string, init?: RequestInit) => {
      seen.push([url, init]);
      return url === "/api/reserve" ? reserve() : serve(frame)(url);
    }) as unknown as typeof fetch;

  const answer = (body: unknown) =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(body),
    } as Response);

  const OTHER = new TextEncoder().encode("another frame");

  it("a mismatch the fresh record still names is reported, after an uncached recheck", async () => {
    const seen: [string, RequestInit | undefined][] = [];

    expect(
      await checkReserve(live(), {
        fetchImpl: routed(OTHER, () => answer(live()), seen),
        subtle,
        pubHex,
      }),
    ).toBe("mismatch");

    const recheck = seen.find(([u]) => u === "/api/reserve");
    expect(recheck?.[1]?.cache).toBe("no-store");
  });

  it("a mismatch on a frame that moved under the check reads as checking", async () => {
    expect(
      await checkReserve(live(), {
        fetchImpl: routed(OTHER, () =>
          answer({ ...live(), counter: 10, sha256: "ef".repeat(32) }),
        ),
        subtle,
        pubHex,
      }),
    ).toBe("checking");
  });

  it("a mismatch whose recheck fails reads as checking, not mismatch", async () => {
    expect(
      await checkReserve(live(), {
        fetchImpl: routed(OTHER, () => Promise.reject(new Error("down"))),
        subtle,
        pubHex,
      }),
    ).toBe("checking");
  });

  it("a verified frame does not recheck the record", async () => {
    const seen: [string, RequestInit | undefined][] = [];

    expect(
      await checkReserve(live(), {
        fetchImpl: routed(FRAME, () => answer(live()), seen),
        subtle,
        pubHex,
      }),
    ).toBe("verified");

    expect(seen.map(([u]) => u)).toEqual(["/api/frame/9"]);
  });

  it("a record with no signature is not checked", async () => {
    expect(
      await checkReserve(
        { ...live(), sig: null },
        { fetchImpl: serve(FRAME), subtle, pubHex },
      ),
    ).toBe("incomplete");
  });

  it("a frame that cannot be fetched is not checked", async () => {
    expect(
      await checkReserve(live(), {
        fetchImpl: serve(FRAME, false),
        subtle,
        pubHex,
      }),
    ).toBe("unavailable");

    expect(
      await checkReserve(live(), {
        fetchImpl: () => Promise.reject(new Error("down")),
        subtle,
        pubHex,
      }),
    ).toBe("unavailable");
  });

  it("a browser without Ed25519 is told so", async () => {
    expect(
      await checkReserve(live(), {
        fetchImpl: serve(FRAME),
        subtle: undefined,
        pubHex,
      }),
    ).toBe("unsupported");
  });
});

describe("recordFor", () => {
  it("dark: every field reads None and the status reads dark", () => {
    expect(recordFor(DARK)).toEqual({
      counter: "None",
      captured: "None",
      sha256: "None",
      sig: "None",
      status: "dark",
    });
  });

  it("a live record: the counter, the capture time in UTC, the hex as sent", () => {
    expect(
      recordFor({
        frameUrl: "/api/frame/1204",
        counter: 1204,
        ts: 1_790_000_000,
        sha256: "ab".repeat(32),
        sig: "cd".repeat(64),
        croText: null,
        status: "stale",
      }),
    ).toEqual({
      counter: "1204",
      captured: "2026-09-21T14:13:20Z",
      sha256: "ab".repeat(32),
      sig: "cd".repeat(64),
      status: "stale",
    });
  });
});

describe("VERDICT_TEXT", () => {
  it("carries the owner's status lines verbatim", () => {
    expect(VERDICT_TEXT.verified).toBe("Verified in this browser");
    expect(VERDICT_TEXT.mismatch).toBe("Hash mismatch");
    expect(VERDICT_TEXT.invalid).toBe("Signature invalid");

    expect(VERDICT_TEXT.unsupported).toBe(
      "Not checked: this browser does not support Ed25519",
    );

    expect(VERDICT_TEXT.dark).toBe("No frame to check");
  });
});
