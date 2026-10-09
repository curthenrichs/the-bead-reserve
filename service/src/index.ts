export interface Env {
  FRAMES: R2Bucket;
  META: KVNamespace;
  HMAC_SECRET: string;
  ED25519_PUBKEY: string;
  FRESH_MAX_S: string;
  STALE_MAX_S: string;
  SUPPORTED_PROTOCOLS: string;
  API_VERSION: string;
}

export function json(body: unknown, status: number, env: Env, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  headers.set("Content-Type", "application/json");
  headers.set("X-Beadz-Api", `beadz-ingest/${env.API_VERSION}`);
  return new Response(JSON.stringify(body), { status, headers });
}

// A positive integer with no leading zero, at most 19 digits (ingest caps
// counters below 2^63). Anything else falls through to not_found.
const FRAME_BY_COUNTER = /^\/api\/frame\/([1-9][0-9]{0,18})$/;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const { method } = request;
    // Ingest and serve branches are wired in by Tasks S3 and S4.
    if (url.pathname === "/api/ingest") {
      if (method !== "POST") return json({ error: "method_not_allowed" }, 405, env);
      const { handleIngest } = await import("./ingest");
      return handleIngest(request, env);
    }
    if (url.pathname === "/api/reserve") {
      if (method !== "GET") return json({ error: "method_not_allowed" }, 405, env);
      const { handleReserve } = await import("./reserve");
      return handleReserve(request, env);
    }
    if (url.pathname === "/api/frame/latest") {
      if (method !== "GET") return json({ error: "method_not_allowed" }, 405, env);
      const { handleFrameLatest } = await import("./reserve");
      return handleFrameLatest(request, env);
    }
    const frame = FRAME_BY_COUNTER.exec(url.pathname);
    if (frame) {
      if (method !== "GET") return json({ error: "method_not_allowed" }, 405, env);
      const { handleFrameByCounter } = await import("./reserve");
      return handleFrameByCounter(frame[1], env);
    }
    return json({ error: "not_found" }, 404, env);
  },
} satisfies ExportedHandler<Env>;
