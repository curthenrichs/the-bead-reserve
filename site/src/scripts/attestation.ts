/* The attestation record on /fault-cam/ and the check a visitor's
   browser runs on it. Pure functions with WebCrypto passed in, so the
   tests sign real frames in node. The check is the one the Worker runs
   at ingest (service/src/crypto.ts): SHA-256 of the frame bytes must
   equal the published hash, and the Ed25519 signature is over the 32
   raw digest bytes, every value hex. */
import type { Reserve, Status } from "./camera-state";

export type Verdict =
  | "checking"
  | "verified"
  | "mismatch"
  | "invalid"
  | "unsupported"
  | "incomplete"
  | "unavailable"
  | "dark";

export const VERDICT_TEXT: Record<Verdict, string> = {
  checking: "Checking in this browser",
  verified: "Verified in this browser",
  mismatch: "Hash mismatch",
  invalid: "Signature invalid",
  unsupported: "Not checked: this browser does not support Ed25519",
  incomplete: "Not checked: no signature is on file for this frame",
  unavailable: "Not checked: the frame could not be retrieved",
  dark: "No frame to check",
};

/* The record's placeholder when there is nothing to show. */
export const NONE = "None";

export const FRAME_URL = "/api/frame/latest";

export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  if (hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) {
    throw new Error("invalid hex");
  }

  const out = new Uint8Array(hex.length / 2);

  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }

  return out;
}

export function bytesToHex(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}

export async function sha256Hex(
  bytes: Uint8Array<ArrayBuffer>,
  subtle: SubtleCrypto,
): Promise<string> {
  return bytesToHex(new Uint8Array(await subtle.digest("SHA-256", bytes)));
}

function importDeviceKey(
  subtle: SubtleCrypto,
  pubHex: string,
): Promise<CryptoKey> {
  return subtle.importKey(
    "raw",
    hexToBytes(pubHex),
    { name: "Ed25519" },
    false,
    ["verify"],
  );
}

/* Feature detection by doing it: older browsers throw on the Ed25519
   algorithm name, and some have no WebCrypto at all. */
export async function ed25519Supported(
  subtle: SubtleCrypto | undefined,
  pubHex: string,
): Promise<boolean> {
  if (!subtle) return false;

  try {
    await importDeviceKey(subtle, pubHex);
    return true;
  } catch {
    return false;
  }
}

export async function verifyFrame(
  bytes: Uint8Array<ArrayBuffer>,
  sha256: string,
  sig: string,
  pubHex: string,
  subtle: SubtleCrypto,
): Promise<"verified" | "mismatch" | "invalid"> {
  const actual = await sha256Hex(bytes, subtle);
  if (actual !== sha256.toLowerCase()) return "mismatch";

  try {
    const key = await importDeviceKey(subtle, pubHex);

    const ok = await subtle.verify(
      "Ed25519",
      key,
      hexToBytes(sig),
      hexToBytes(actual),
    );

    return ok ? "verified" : "invalid";
  } catch {
    return "invalid";
  }
}

export interface CheckOptions {
  fetchImpl: typeof fetch;
  subtle: SubtleCrypto | undefined;
  pubHex: string;
}

/* The whole check for one reading. The frame is fetched uncached so the
   bytes are the ones the Worker serves now, not a copy the monitor's
   image already pulled. */
export async function checkReserve(
  r: Reserve,
  { fetchImpl, subtle, pubHex }: CheckOptions,
): Promise<Verdict> {
  if (r.status === "dark" || r.counter === null) return "dark";
  if (!r.sha256 || !r.sig) return "incomplete";

  if (!subtle || !(await ed25519Supported(subtle, pubHex))) {
    return "unsupported";
  }

  let bytes: Uint8Array<ArrayBuffer>;

  try {
    const res = await fetchImpl(FRAME_URL, { cache: "no-store" });
    if (!res.ok) return "unavailable";
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch {
    return "unavailable";
  }

  return verifyFrame(bytes, r.sha256, r.sig, pubHex, subtle);
}

export interface RecordView {
  counter: string;
  captured: string;
  sha256: string;
  sig: string;
  status: Status;
}

/* Capture time as UTC ISO 8601 to the second. */
const captured = (ts: number): string =>
  new Date(ts * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");

export function recordFor(r: Reserve): RecordView {
  return {
    counter: r.counter === null ? NONE : String(r.counter),
    captured: r.ts === null ? NONE : captured(r.ts),
    sha256: r.sha256 ?? NONE,
    sig: r.sig ?? NONE,
    status: r.status,
  };
}
