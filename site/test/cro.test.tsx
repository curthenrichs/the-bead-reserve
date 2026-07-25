import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen } from "@testing-library/react";
import CameraMonitor, { CRO_MOOD } from "../src/islands/CameraMonitor";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(HERE, "..", "public");

describe("CRO mood mapping", () => {
  it("maps every monitor state to a mood", () => {
    expect(CRO_MOOD.fresh).toBe("/henry-cro-broadcasting.svg");
    expect(CRO_MOOD.stale).toBe("/henry-cro-signal-lost.svg");
    expect(CRO_MOOD.dark).toBe("/henry-cro-low-battery.svg");
  });

  it.each(Object.values(CRO_MOOD))("%s exists in public/", (src) => {
    expect(fs.existsSync(path.join(publicDir, src.replace(/^\//, "")))).toBe(true);
  });

  it("uses illustration form: #555555 outline, transparent ground, no icon-form ground rect", () => {
    for (const src of Object.values(CRO_MOOD)) {
      const svg = fs.readFileSync(path.join(publicDir, src.replace(/^\//, "")), "utf8");

      // Illustration form has the #555555 outline; icon form has none.
      expect(svg).toContain("#555555");

      // Icon form's ground fill; illustration form must never use it.
      expect(svg).not.toContain("#111111");

      // Illustration form has a transparent ground: no <rect> may cover the
      // full viewBox (that would be an opaque icon-form ground rect). Parse
      // the actual viewBox rather than assuming 512x512, since these three
      // files have distinct, non-square viewBoxes.
      const viewBoxMatch = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
      expect(viewBoxMatch, `no viewBox found in ${src}`).not.toBeNull();
      const [, vbWidth, vbHeight] = viewBoxMatch as RegExpMatchArray;

      const rectTags = svg.match(/<rect\b[^>]*>/g) || [];
      const fullViewBoxRect = rectTags.find((tag) => {
        const w = tag.match(/width="([\d.]+)"/);
        const h = tag.match(/height="([\d.]+)"/);
        return !!w && !!h && w[1] === vbWidth && h[1] === vbHeight;
      });
      expect(fullViewBoxRect, `found a full-viewBox rect in ${src}: ${fullViewBoxRect}`).toBeUndefined();
    }
  });
});

describe("CameraMonitor renders the CRO", () => {
  it("shows the low-battery Henry in the default dark state", () => {
    // pollMs=0 disables the interval; the initial state is "dark"
    render(<CameraMonitor pollMs={0} />);
    const img = screen.getByAltText(/chief reserve officer/i) as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/henry-cro-low-battery.svg");
  });
});
