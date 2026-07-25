import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HENRY_GEOMETRY, henryGroup } from "./henry.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const master = fs.readFileSync(path.join(HERE, "vendor", "henry-master.svg"), "utf8");

describe("vendored master (drift guard)", () => {
  it("still has the head geometry the seal composes against", () => {
    expect(master).toContain('<rect x="106" y="200" width="300" height="214" rx="52" fill="#ffffff"/>');
  });

  it("still has both eyes at r=27", () => {
    expect(master).toContain('<circle cx="196" cy="304" r="27"');
    expect(master).toContain('<circle cx="316" cy="304" r="27"');
  });

  it("still has the antenna ball at r=32 and halo at r=50", () => {
    expect(master).toContain('<circle cx="256" cy="112" r="32"');
    expect(master).toContain('<circle cx="256" cy="112" r="50"');
  });

  it("matches the constants the module exposes", () => {
    expect(HENRY_GEOMETRY.head).toEqual({ x: 106, y: 200, w: 300, h: 214, rx: 52 });
    expect(HENRY_GEOMETRY.ball).toEqual({ cx: 256, cy: 112, r: 32 });
  });
});

describe("henryGroup", () => {
  it("omits the master's ground rect — the seal supplies its own ground", () => {
    const g = henryGroup({ cx: 256, cy: 232, scale: 0.47, ground: "#1b140c", bead: true });
    expect(g).not.toContain('width="512" height="512"');
    expect(g).not.toContain("#111111");
  });

  it("adds the bead hole in the ground color when bead is true", () => {
    const g = henryGroup({ cx: 256, cy: 232, scale: 0.47, ground: "#1b140c", bead: true });
    expect(g).toContain('<circle cx="256" cy="112" r="11" fill="#1b140c"/>');
  });

  it("omits the bead hole when bead is false", () => {
    const g = henryGroup({ cx: 256, cy: 232, scale: 0.47, ground: "#1b140c", bead: false });
    expect(g).not.toContain('r="11"');
  });

  it("emits no text element", () => {
    const g = henryGroup({ cx: 256, cy: 232, scale: 0.47, ground: "#1b140c", bead: true });
    expect(g).not.toContain("<text");
  });

  it("places the group at the requested transform", () => {
    const g = henryGroup({ cx: 300, cy: 200, scale: 0.5, ground: "#1b140c", bead: true });
    expect(g).toContain("translate(300,200) scale(0.5) translate(-256,-238)");
  });
});
