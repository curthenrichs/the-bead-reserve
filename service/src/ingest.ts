import { Env, json } from "./index";
import { decodeBase64, sha256Hex, verifyHmac, verifyEd25519 } from "./crypto";

const TS_SKEW_WARN_S = 600;

interface Payload {
  counter: number;
  ts: number;
  sha256: string;
  sig: string;
  croText: string | null;
  image_b64: string;
}

function validShape(p: any): p is Payload {
  return (
    typeof p === "object" && p !== null &&
    typeof p.counter === "number" && Number.isInteger(p.counter) &&
    p.counter > 0 && p.counter < 2 ** 63 &&
    typeof p.ts === "number" && Number.isInteger(p.ts) &&
    typeof p.sha256 === "string" &&
    typeof p.sig === "string" &&
    typeof p.image_b64 === "string" &&
    (p.croText === null || typeof p.croText === "string")
  );
  // NB: JS booleans are typeof "boolean", so the number checks already exclude
  // true/false. Counters above 2^53 lose precision in JS — out of PoC scope
  // (the device emits small monotonic counters); flagged for production.
}

export async function handleIngest(request: Request, env: Env): Promise<Response> {
  const raw = new Uint8Array(await request.arrayBuffer());

  // 1. HMAC over the exact raw body bytes
  const mac = request.headers.get("X-Beadz-Mac") ?? "";
  if (!(await verifyHmac(env.HMAC_SECRET, raw, mac))) {
    return json({ error: "bad_mac" }, 401, env);
  }
  // 1b. protocol gate — absent means "1"
  const protocol = request.headers.get("X-Beadz-Protocol");
  const supported = env.SUPPORTED_PROTOCOLS.split(",").map((s) => s.trim());
  if (protocol !== null && !supported.includes(protocol)) {
    return json({ error: "unsupported_protocol" }, 400, env);
  }
  // 2. shape + base64
  let p: Payload;
  let image: Uint8Array;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(raw));
    if (!validShape(parsed)) return json({ error: "bad_request" }, 400, env);
    p = parsed;
    image = decodeBase64(p.image_b64);
  } catch {
    return json({ error: "bad_request" }, 400, env);
  }
  // 3. hash of the actual bytes + Ed25519 over the 32 digest bytes
  const okHash = (await sha256Hex(image)) === p.sha256;
  if (!okHash || !(await verifyEd25519(env.ED25519_PUBKEY, p.sha256, p.sig))) {
    return json({ error: "bad_signature" }, 400, env);
  }
  // 4. counter monotonicity (best-effort under KV eventual consistency — see spec §3)
  const lastSeen = parseInt((await env.META.get("last_seen")) ?? "0", 10);
  if (p.counter <= lastSeen) {
    return json({ error: "counter_seen" }, 409, env);
  }
  // 5. ts skew: warn only, never rejects
  const age = Math.floor(Date.now() / 1000) - p.ts;
  if (Math.abs(age) > TS_SKEW_WARN_S) {
    console.warn(`ts skew: counter=${p.counter} age=${age}s`);
  }
  // accept: store frame + metadata
  const r2Key = `frames/${p.counter}.jpg`;
  await env.FRAMES.put(r2Key, image, { httpMetadata: { contentType: "image/jpeg" } });
  const meta = {
    counter: p.counter, ts: p.ts, sha256: p.sha256, sig: p.sig, croText: p.croText,
    r2Key, receivedAt: Math.floor(Date.now() / 1000),
    clientVersion: request.headers.get("X-Beadz-Client"),
    protocolVersion: protocol ?? "1",
  };
  await env.META.put("latest", JSON.stringify(meta));
  await env.META.put("last_seen", String(p.counter));
  return json({ ok: true, counter: p.counter }, 200, env);
}
