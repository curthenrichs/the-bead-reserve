import { describe, it, expect } from "vitest";
import {
  parseReserve,
  viewFor,
  DARK,
  CRO_MOOD,
  isFrameUrl,
} from "../src/scripts/camera-state";

const fresh = {
  frameUrl: "/api/frame/7",
  counter: 7,
  ts: 1_790_000_000,
  sha256: "ab".repeat(32),
  sig: "cd".repeat(64),
  croText: "the reserve remains sealed",
  status: "fresh",
  apiVersion: "0.1.0",
};

describe("parseReserve", () => {
  it("accepts a well-formed fresh body", () => {
    expect(parseReserve(fresh)).toMatchObject({
      status: "fresh",
      counter: 7,
      croText: "the reserve remains sealed",
    });
  });

  it("keeps the frame signature for the attestation record", () => {
    expect(parseReserve(fresh).sig).toBe("cd".repeat(64));
    expect(parseReserve({ ...fresh, sig: null }).sig).toBeNull();
    expect(DARK.sig).toBeNull();
  });

  it("treats the empty Worker state as dark", () => {
    expect(
      parseReserve({
        ...fresh,
        frameUrl: null,
        counter: null,
        ts: null,
        sha256: null,
        sig: null,
        croText: null,
        status: "dark",
      }).status,
    ).toBe("dark");
  });

  it.each([
    ["null", null],
    ["a string", "<html>error</html>"],
    ["an array", [fresh]],
    ["an unknown status", { ...fresh, status: "glowing" }],
    ["a string counter", { ...fresh, counter: "7" }],
    ["a numeric croText", { ...fresh, croText: 5 }],
    ["a numeric sig", { ...fresh, sig: 5 }],
  ])("falls back to DARK for %s", (_name, body) => {
    expect(parseReserve(body)).toEqual(DARK);
  });
});

describe("isFrameUrl", () => {
  it.each(["/api/frame/7", "/api/frame/latest"])("accepts %s", (u) => {
    expect(isFrameUrl(u)).toBe(true);
  });

  it.each([
    null,
    7,
    "",
    "/api/frame/",
    "https://evil.example/api/frame/7",
    "//evil.example/api/frame/7",
    "/api/reserve",
    "api/frame/7",
    "/api/frame/../reserve",
    "/api/frame/7?next=https://evil.example",
    "/api/frame/7\\..\\x",
  ])("rejects %s", (u) => {
    expect(isFrameUrl(u)).toBe(false);
  });
});

describe("parseReserve frameUrl", () => {
  it("keeps a same-origin frame path", () => {
    expect(parseReserve(fresh).frameUrl).toBe("/api/frame/7");
  });

  it("drops a foreign frameUrl to null but keeps the reading", () => {
    const r = parseReserve({
      ...fresh,
      frameUrl: "https://evil.example/x.jpg",
    });

    expect(r.frameUrl).toBeNull();
    expect(r.status).toBe("fresh");
    expect(r.counter).toBe(7);
  });
});

describe("viewFor frame", () => {
  it("shows the frame the reading names", () => {
    expect(viewFor(parseReserve(fresh)).frame).toBe("/api/frame/7");
  });

  it("falls back to /latest when a live reading names no frame", () => {
    expect(viewFor(parseReserve({ ...fresh, frameUrl: null })).frame).toBe(
      "/api/frame/latest",
    );
  });

  it("dark has no frame", () => {
    expect(viewFor(DARK).frame).toBeNull();
  });
});

describe("viewFor", () => {
  it("fresh: live badge, frame shown, REC caption with croText", () => {
    const v = viewFor(parseReserve(fresh));

    expect(v).toMatchObject({
      live: true,
      badge: "● LIVE",
      showFrame: true,
      placeholder: null,
      caption: "REC · reserve in view · the reserve remains sealed",
      mood: CRO_MOOD.fresh,
      moodCaption: "Chief Reserve Officer: reserve in view",
    });
  });

  it("stale: idle badge, last frame kept, delayed caption", () => {
    const v = viewFor(
      parseReserve({ ...fresh, status: "stale", croText: null }),
    );

    expect(v).toMatchObject({
      live: false,
      badge: "○ IDLE",
      showFrame: true,
      caption: "signal delayed, last frame retained",
    });
  });

  it("stale with no frame yet shows no frame", () => {
    expect(
      viewFor(parseReserve({ ...fresh, status: "stale", counter: null }))
        .showFrame,
    ).toBe(false);
  });

  it("dark: no frame, the sealed notice once, empty caption", () => {
    const v = viewFor(DARK);

    expect(v).toMatchObject({
      showFrame: false,
      placeholder: "signal interrupted, reserve remains sealed",
      caption: "",
      mood: CRO_MOOD.dark,
      moodAlt: "Chief Reserve Officer, on low battery",
      moodCaption: "Chief Reserve Officer: standing by in the dark",
    });
  });
});
