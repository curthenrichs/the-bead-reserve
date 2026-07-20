export function hexToBytes(hex: string): Uint8Array {
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

export function decodeBase64(s: string): Uint8Array {
  // atob is lenient about some inputs; validate the alphabet first so bad
  // base64 is a caught client error, never a silent mangle.
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s) || s.length % 4 !== 0) {
    throw new Error("invalid base64");
  }
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest));
}

export async function verifyHmac(secret: string, body: Uint8Array, macHex: string): Promise<boolean> {
  let macBytes: Uint8Array;
  try {
    macBytes = hexToBytes(macHex);
  } catch {
    return false; // malformed MAC header is an auth failure, not a 500
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  // crypto.subtle.verify does a constant-time comparison internally.
  return crypto.subtle.verify("HMAC", key, macBytes, body);
}

export async function verifyEd25519(pubHex: string, sha256Hex: string, sigHex: string): Promise<boolean> {
  let pub: Uint8Array, msg: Uint8Array, sig: Uint8Array;
  try {
    pub = hexToBytes(pubHex);
    msg = hexToBytes(sha256Hex); // the SIGNED message is the raw 32 digest bytes
    sig = hexToBytes(sigHex);
  } catch {
    return false;
  }
  try {
    const key = await crypto.subtle.importKey("raw", pub, { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify("Ed25519", key, sig, msg);
  } catch {
    return false; // unsupported key bytes / algorithm mismatch -> reject, don't 500
  }
}
