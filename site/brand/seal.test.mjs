import { describe, it, expect } from "vitest";
import { sealSvg, PALETTE, COPY } from "./seal.mjs";
import { loadFont, arcLine } from "./lettering.mjs";

// Ring radii mirror the non-exported FULL/SMALL configs in seal.mjs (FULL.ringR
// = 240, SMALL.ringR = 232). Hardcoding them here matches the existing style
// at "draws the circular ground and the ring" below, and lets the thickness
// test key off the ring element itself instead of emission order.
const FULL_RING_R = 240;
const SMALL_RING_R = 232;

function ringStrokeWidth(svg, ringRadius) {
  const m = svg.match(new RegExp(`<circle[^>]*\\br="${ringRadius}"[^>]*stroke-width="(\\d+)"`));
  if (!m) throw new Error(`no circle with r="${ringRadius}" and a stroke-width found`);
  return Number(m[1]);
}

// Every numeric coordinate pair in SVG path data, covering M/L/C/Q alike —
// opentype emits C and Q for curved glyphs, not just M/L, so orientation
// checks must not silently ignore curved letters.
function coordPairs(d) {
  const re = /(-?[\d.]+)\s(-?[\d.]+)/g;
  const out = [];
  let m;
  while ((m = re.exec(d))) out.push([Number(m[1]), Number(m[2])]);
  return out;
}

function meanX(pairs) {
  return pairs.reduce((s, [x]) => s + x, 0) / pairs.length;
}

describe("copy and palette are exact", () => {
  it("uses the agreed strings with U+00B7 separators", () => {
    expect(COPY.rim).toBe("THE BEAD RESERVE");
    expect(COPY.count).toBe("· 47,318 ·");
    expect(COPY.chain).toBe("ERC-20 · BASE");
  });

  it("uses the agreed palette", () => {
    expect(PALETTE.ground).toBe("#1b140c");
    expect(PALETTE.accent).toBe("#ffaa3c");
    expect(PALETTE.accentSoft).toBe("#ffc46e");
  });
});

describe("sealSvg (full)", () => {
  const svg = sealSvg({ lettering: true });

  it("contains no text element — the load-bearing invariant", () => {
    expect(svg).not.toMatch(/<text[\s>]/);
  });

  it("is a 512 square viewBox", () => {
    expect(svg).toContain('viewBox="0 0 512 512"');
  });

  it("draws the circular ground and the ring", () => {
    expect(svg).toContain(`<circle cx="256" cy="256" r="256" fill="${PALETTE.ground}"/>`);
    expect(svg).toContain('r="240" fill="none"');
  });

  it("includes Henry with the bead hole", () => {
    expect(svg).toContain(`<circle cx="256" cy="112" r="11" fill="${PALETTE.ground}"/>`);
  });

  it("emits three lettering paths", () => {
    const paths = svg.match(/<path d="M/g) || [];
    expect(paths.length).toBe(3);
  });
});

describe("arcLine glyph orientation (regression guard for the shipped inversion bug)", () => {
  // arcLine bakes rotation into M/L/C/Q coordinates rather than emitting SVG
  // <path> arc commands, so a check for a right-to-left `A ... 1` sweep flag
  // can never match regardless of what the code does — see brand/README.md /
  // the task writeup for why that made the old version of this test vacuous.
  // These tests instead decode actual glyph geometry.
  const font = loadFont("bold");
  const cx = 256, cy = 256, radius = 200, size = 34;

  // "I" has a single contour (no counter/hole), so its path data is exactly
  // one M...Z run per glyph. That lets multi-glyph output be split into
  // per-glyph ink without reimplementing opentype's outline structure.
  function glyphChunks(d) {
    return d.split(/(?=M)/).filter(Boolean);
  }

  it("sits upright at the top of the arc: ink stays above the baseline", () => {
    // A single character is centered exactly at (cx, cy - radius), the top
    // of the circle. opentype places ink at negative y relative to the
    // baseline it's drawn on, so an upright glyph's coordinates must all sit
    // at or above that baseline y. A 180-degree flip would push them below.
    const d = arcLine({ font, text: "I", cx, cy, radius, size, letterSpacing: 0 });
    const baselineY = cy - radius;
    const ys = coordPairs(d).map(([, y]) => y);
    expect(ys.length).toBeGreaterThan(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(baselineY + 0.5);
    expect(Math.min(...ys)).toBeLessThan(baselineY - 10);
  });

  it("reads left to right: the first character's ink sits left of the last's", () => {
    const d = arcLine({ font, text: "II", cx, cy, radius, size, letterSpacing: 20 });
    const chunks = glyphChunks(d);
    expect(chunks.length).toBe(2);
    expect(meanX(coordPairs(chunks[0]))).toBeLessThan(meanX(coordPairs(chunks[1])));
  });

  it("rotates glyphs to their tangent with the correct sign on each side of the arc", () => {
    // Spread five glyphs across a wide arc. Each glyph's own anchor is the
    // point on the circle at its `mid` angle (the same top-of-arc geometry
    // the first test relies on, generalized off-center). A correctly-signed
    // tangent rotation tips a left-side glyph's ink toward -x relative to
    // its own anchor, and a right-side glyph's ink toward +x; flipping the
    // rotation sign flips both.
    const text = "IIIII";
    const letterSpacing = 20;
    const d = arcLine({ font, text, cx, cy, radius, size, letterSpacing });
    const chunks = glyphChunks(d);
    expect(chunks.length).toBe(5);

    const chars = [...text];
    const widths = chars.map((c) => font.getAdvanceWidth(c, size) + letterSpacing);
    const total = widths.reduce((a, b) => a + b, 0);
    let angle = -Math.PI / 2 - total / radius / 2;
    const mids = chars.map((_, i) => {
      const mid = angle + widths[i] / 2 / radius;
      angle += widths[i] / radius;
      return mid;
    });

    const leftAnchorX = cx + radius * Math.cos(mids[0]);
    const rightAnchorX = cx + radius * Math.cos(mids[4]);
    const leftInkX = meanX(coordPairs(chunks[0]));
    const rightInkX = meanX(coordPairs(chunks[4]));

    expect(leftInkX - leftAnchorX).toBeLessThan(0);
    expect(rightInkX - rightAnchorX).toBeGreaterThan(0);
  });
});

describe("sealSvg (small)", () => {
  const svg = sealSvg({ lettering: false });

  it("drops all lettering", () => {
    expect(svg).not.toMatch(/<text[\s>]/);
    expect(svg.match(/<path d="M/g)).toBeNull();
  });

  it("still contains Henry and the ring", () => {
    expect(svg).toContain("<g transform=");
    expect(svg).toContain('fill="none"');
  });

  it("uses a thicker ring than the full mark", () => {
    const thick = ringStrokeWidth(svg, SMALL_RING_R);
    const thin = ringStrokeWidth(sealSvg({ lettering: true }), FULL_RING_R);
    expect(thick).toBeGreaterThan(thin);
  });
});
