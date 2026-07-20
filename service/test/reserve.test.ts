import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src/index";

async function get(path: string) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`https://x.dev${path}`), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

async function seed(over: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const meta = { counter: 7, ts: now, sha256: "ab".repeat(32), sig: "cd".repeat(64),
    croText: "the reserve remains sealed", r2Key: "frames/7.jpg", receivedAt: now,
    clientVersion: "beadz-camera/0.1.0", protocolVersion: "1", ...over };
  await env.META.put("latest", JSON.stringify(meta));
  await env.FRAMES.put("frames/7.jpg", new Uint8Array([1, 2, 3]), { httpMetadata: { contentType: "image/jpeg" } });
  return meta;
}

describe("GET /api/reserve", () => {
  it("empty state -> dark with null fields", async () => {
    const res = await get("/api/reserve");
    expect(res.status).toBe(200);
    const b = await res.json() as any;
    expect(b.status).toBe("dark");
    expect(b.counter).toBeNull();
    expect(b.apiVersion).toBe("0.1.0");
  });
  it("fresh frame -> status fresh, echoes fields", async () => {
    await seed();
    const b = await (await get("/api/reserve")).json() as any;
    expect(b.status).toBe("fresh");
    expect(b.counter).toBe(7);
    expect(b.croText).toBe("the reserve remains sealed");
    expect(b.frameUrl).toBe("/api/frame/latest");
  });
  it("age past FRESH_MAX_S but under STALE_MAX_S -> stale", async () => {
    await seed({ ts: Math.floor(Date.now() / 1000) - 3600 * 3 }); // 3h, FRESH=90m STALE=6h
    const b = await (await get("/api/reserve")).json() as any;
    expect(b.status).toBe("stale");
  });
  it("age past STALE_MAX_S -> dark", async () => {
    await seed({ ts: Math.floor(Date.now() / 1000) - 3600 * 12 });
    const b = await (await get("/api/reserve")).json() as any;
    expect(b.status).toBe("dark");
  });
});

describe("GET /api/frame/latest", () => {
  it("no frame -> 404 no_frame", async () => {
    const res = await get("/api/frame/latest");
    expect(res.status).toBe(404);
  });
  it("streams stored jpeg", async () => {
    await seed();
    const res = await get("/api/frame/latest");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });
});
