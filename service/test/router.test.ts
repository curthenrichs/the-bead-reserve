import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src/index";

async function call(method: string, path: string) {
  const req = new Request(`https://x.dev${path}`, { method });
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe("router", () => {
  it("unknown path -> 404", async () => {
    const res = await call("GET", "/nope");
    expect(res.status).toBe(404);
  });

  it("known path wrong method -> 405", async () => {
    const res = await call("DELETE", "/api/ingest");
    expect(res.status).toBe(405);
  });

  it("every response carries X-Beadz-Api", async () => {
    const res = await call("GET", "/nope");
    expect(res.headers.get("X-Beadz-Api")).toBe("beadz-ingest/0.1.0");
  });
});
