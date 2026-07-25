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

  it("uses illustration form: gray outline, no dark ground rect", () => {
    for (const src of Object.values(CRO_MOOD)) {
      const svg = fs.readFileSync(path.join(publicDir, src.replace(/^\//, "")), "utf8");
      expect(svg).toContain("#555555");
      expect(svg).not.toContain('width="512" height="512"');
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
