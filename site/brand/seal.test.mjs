import { describe, it, expect } from "vitest";
import { sealSvg, PALETTE, COPY } from "./seal.mjs";

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

  it("never inverts glyphs: no right-to-left arc sweep", () => {
    // a bottom arc would need sweep flag 1 to run right-to-left; we emit none
    expect(svg).not.toMatch(/A\s[\d.]+\s[\d.]+\s0\s0\s1/);
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
    const thick = Number(svg.match(/stroke-width="(\d+)"/)[1]);
    const thin = Number(sealSvg({ lettering: true }).match(/stroke-width="(\d+)"/)[1]);
    expect(thick).toBeGreaterThan(thin);
  });
});
