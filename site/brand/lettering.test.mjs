import { describe, it, expect } from "vitest";
import { loadFont, flatLine, arcLine } from "./lettering.mjs";

// Sample every coordinate pair in the path data, not just M/L commands —
// opentype.js emits C and Q for curved glyphs, and ignoring those
// under-samples the bounding box for round letters like B, D, R, S.
const points = (d) =>
  [...d.matchAll(/(-?[\d.]+)\s(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);

describe("loadFont", () => {
  it("loads bold at weight 700 and regular at 400", () => {
    expect(loadFont("bold").tables.os2.usWeightClass).toBe(700);
    expect(loadFont("regular").tables.os2.usWeightClass).toBe(400);
  });

  it("rejects an unknown weight", () => {
    expect(() => loadFont("semibold")).toThrow(/unknown weight/i);
  });
});

describe("flatLine", () => {
  const font = loadFont("bold");

  it("returns SVG path data, not text", () => {
    const d = flatLine({ font, text: "BEADZ", cx: 256, baseline: 100, size: 27, letterSpacing: 6 });
    expect(d.startsWith("M")).toBe(true);
    expect(d).not.toContain("<text");
    expect(d.length).toBeGreaterThan(100);
  });

  it("centers on cx: the drawn ink straddles the center", () => {
    const d = flatLine({ font, text: "BEADZ", cx: 256, baseline: 100, size: 27, letterSpacing: 6 });
    const xs = points(d).map((p) => p[0]);
    const min = Math.min(...xs);
    const max = Math.max(...xs);
    // midpoint of the ink is within a glyph-width of the requested center
    expect(Math.abs((min + max) / 2 - 256)).toBeLessThan(20);
  });

  it("widens with letterSpacing", () => {
    const tight = flatLine({ font, text: "BEADZ", cx: 256, baseline: 100, size: 27, letterSpacing: 0 });
    const loose = flatLine({ font, text: "BEADZ", cx: 256, baseline: 100, size: 27, letterSpacing: 12 });
    const spanOf = (d) => {
      const xs = points(d).map((p) => p[0]);
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(spanOf(loose)).toBeGreaterThan(spanOf(tight));
  });
});

describe("arcLine", () => {
  const font = loadFont("bold");

  it("returns path data with no text element", () => {
    const d = arcLine({ font, text: "THE BEAD RESERVE", cx: 256, cy: 256, radius: 196, size: 34, letterSpacing: 7 });
    expect(d.startsWith("M")).toBe(true);
    expect(d).not.toContain("<text");
  });

  it("places ink in the upper half, symmetric about the vertical axis", () => {
    const d = arcLine({ font, text: "THE BEAD RESERVE", cx: 256, cy: 256, radius: 196, size: 34, letterSpacing: 7 });
    const pts = points(d);
    const ys = pts.map((p) => p[1]);
    // every glyph sits above the horizontal centerline
    expect(Math.max(...ys)).toBeLessThan(256);
    const xs = pts.map((p) => p[0]);
    expect(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - 256)).toBeLessThan(12);
  });

  it("never emits a rotate transform — rotation is baked into coordinates", () => {
    const d = arcLine({ font, text: "THE BEAD RESERVE", cx: 256, cy: 256, radius: 196, size: 34, letterSpacing: 7 });
    expect(d).not.toContain("rotate");
    expect(d).not.toContain("transform");
  });
});
