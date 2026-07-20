import { Env, json } from "./index";

export function freshness(ageS: number, env: Env): "fresh" | "stale" | "dark" {
  if (ageS < 0) return "fresh"; // future ts (clock skew): treat as fresh, not dark
  if (ageS < parseInt(env.FRESH_MAX_S, 10)) return "fresh";
  if (ageS < parseInt(env.STALE_MAX_S, 10)) return "stale";
  return "dark";
}

export async function handleReserve(_request: Request, env: Env): Promise<Response> {
  const rawMeta = await env.META.get("latest");
  if (!rawMeta) {
    return json({
      frameUrl: null, counter: null, ts: null, sha256: null, sig: null,
      croText: null, status: "dark", apiVersion: env.API_VERSION,
    }, 200, env);
  }
  const m = JSON.parse(rawMeta);
  const age = Math.floor(Date.now() / 1000) - m.ts;
  return json({
    frameUrl: "/api/frame/latest",
    counter: m.counter, ts: m.ts, sha256: m.sha256, sig: m.sig,
    croText: m.croText, status: freshness(age, env), apiVersion: env.API_VERSION,
  }, 200, env);
}

export async function handleFrameLatest(_request: Request, env: Env): Promise<Response> {
  const rawMeta = await env.META.get("latest");
  if (!rawMeta) return json({ error: "no_frame" }, 404, env);
  const { r2Key } = JSON.parse(rawMeta);
  const obj = await env.FRAMES.get(r2Key);
  if (!obj) return json({ error: "no_frame" }, 404, env);
  return new Response(obj.body, {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=60",
      "X-Beadz-Api": `beadz-ingest/${env.API_VERSION}`,
    },
  });
}
