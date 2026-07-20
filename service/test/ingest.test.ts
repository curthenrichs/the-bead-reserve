import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../src/index";

const SECRET = "test-secret";
const PUB = "d04ab232742bb4ab3a1368bd4615e4e6d0224ab71a016baf8520a332c9778737";
const SHA = "bbf6124fd0287f049f9bd572995c6d04874b173eeeb32b070aef2504d686b87f";
const SIG = "c65488d6b784562fbcf30cc542f3dbbe139189b8e9d3ed5a969665f85a6ffbcc576115294df8c7bd46da02bd2a40e1bbae305cd1d01a22c2c9865f42395ecf01";
const IMAGE_B64 = "anBlZ2J5dGVz"; // base64("jpegbytes")
const enc = new TextEncoder();

// env.ED25519_PUBKEY comes from wrangler.toml; override it to the test key here.
beforeAll(() => { (env as any).ED25519_PUBKEY = PUB; });

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return [...new Uint8Array(sig)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function bodyStr(over: Record<string, unknown> = {}): string {
  return JSON.stringify({ counter: 1, ts: 1, sha256: SHA, sig: SIG, croText: null, image_b64: IMAGE_B64, ...over });
}

async function ingest(body: string, headers: Record<string, string> = {}): Promise<Response> {
  const h = new Headers({ "Content-Type": "application/json", ...headers });
  if (!h.has("X-Beadz-Mac")) h.set("X-Beadz-Mac", await hmacHex(SECRET, body));
  const req = new Request("https://x.dev/api/ingest", { method: "POST", body, headers: h });
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe("POST /api/ingest contract", () => {
  it("accepts a valid push, stores frame + meta", async () => {
    const res = await ingest(bodyStr({ counter: 1 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, counter: 1 });
    const obj = await env.FRAMES.get("frames/1.jpg");
    expect(obj).not.toBeNull();
    const meta = JSON.parse((await env.META.get("latest"))!);
    expect(meta.counter).toBe(1);
    expect(meta).not.toHaveProperty("image_b64");
    expect(await env.META.get("last_seen")).toBe("1");
  });
  it("bad MAC -> 401 bad_mac", async () => {
    const res = await ingest(bodyStr({ counter: 2 }), { "X-Beadz-Mac": "0".repeat(64) });
    expect(res.status).toBe(401);
    expect((await res.json() as any).error).toBe("bad_mac");
  });
  it("unsupported protocol -> 400, checked after MAC", async () => {
    const res = await ingest(bodyStr({ counter: 2 }), { "X-Beadz-Protocol": "99" });
    expect(res.status).toBe(400);
    expect((await res.json() as any).error).toBe("unsupported_protocol");
    const bad = await ingest(bodyStr({ counter: 2 }), { "X-Beadz-Mac": "0".repeat(64), "X-Beadz-Protocol": "99" });
    expect((await bad.json() as any).error).toBe("bad_mac"); // MAC wins
  });
  it("absent protocol accepted (defaults to 1)", async () => {
    expect((await ingest(bodyStr({ counter: 3 }))).status).toBe(200);
  });
  it("not JSON -> 400 bad_request", async () => {
    expect((await ingest("not json{")).status).toBe(400);
  });
  it("boolean counter -> 400 bad_request", async () => {
    const res = await ingest(bodyStr({ counter: true }));
    expect(res.status).toBe(400);
    expect((await res.json() as any).error).toBe("bad_request");
  });
  it("wrong hash -> 400 bad_signature", async () => {
    const res = await ingest(bodyStr({ counter: 4, sha256: "ab".repeat(32) }));
    expect(res.status).toBe(400);
    expect((await res.json() as any).error).toBe("bad_signature");
  });
  it("malformed hex sig -> 400 bad_signature not 500", async () => {
    const res = await ingest(bodyStr({ counter: 4, sig: "zz-not-hex" }));
    expect(res.status).toBe(400);
    expect((await res.json() as any).error).toBe("bad_signature");
  });
  it("invalid base64 image -> 400 bad_request", async () => {
    const res = await ingest(bodyStr({ counter: 4, image_b64: "@@@" }));
    expect(res.status).toBe(400);
    expect((await res.json() as any).error).toBe("bad_request");
  });
  it("replay / stale counter -> 409 counter_seen", async () => {
    await ingest(bodyStr({ counter: 50 }));
    const res = await ingest(bodyStr({ counter: 50 }));
    expect(res.status).toBe(409);
    expect((await res.json() as any).error).toBe("counter_seen");
    expect((await ingest(bodyStr({ counter: 49 }))).status).toBe(409);
  });
  it("stores client + protocol version", async () => {
    await ingest(bodyStr({ counter: 60 }), { "X-Beadz-Client": "beadz-camera/0.1.0", "X-Beadz-Protocol": "1" });
    const meta = JSON.parse((await env.META.get("latest"))!);
    expect(meta.clientVersion).toBe("beadz-camera/0.1.0");
    expect(meta.protocolVersion).toBe("1");
  });
});
