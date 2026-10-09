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

  it("/api/frame/{counter} wrong method -> 405", async () => {
    const res = await call("POST", "/api/frame/7");
    expect(res.status).toBe(405);
  });

  it("/api/frame/latest is still routed (404 no_frame, not not_found)", async () => {
    const res = await call("GET", "/api/frame/latest");
    expect(res.status).toBe(404);
    expect((await res.json() as any).error).toBe("no_frame");
  });

  it("valid counter is routed to the frame handler", async () => {
    const res = await call("GET", "/api/frame/7");
    expect(res.status).toBe(404);
    expect((await res.json() as any).error).toBe("no_frame");
  });

  for (const bad of ["0", "007", "-1", "1.5", "1e3", "abc", "7.jpg", "12345678901234567890", "%37", "7/", "", "..%2Flatest"]) {
    it(`bad counter ${JSON.stringify(bad)} -> 404 not_found`, async () => {
      const res = await call("GET", `/api/frame/${bad}`);
      expect(res.status).toBe(404);
      expect((await res.json() as any).error).toBe("not_found");
    });
  }

  it("every response carries X-Beadz-Api", async () => {
    const res = await call("GET", "/nope");
    expect(res.headers.get("X-Beadz-Api")).toBe("beadz-ingest/0.1.0");
  });
});
