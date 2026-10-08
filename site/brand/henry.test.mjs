import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HENRY_GEOMETRY, henryGroup } from "./henry.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const master = fs.readFileSync(
  path.join(HERE, "vendor", "henry-master.svg"),
  "utf8",
);

// --- Minimal attribute-only SVG tag parser -------------------------------
// No XML library is available; the vendored file is simple enough (flat,
// self-closing <circle>/<rect> tags) that a regex extraction of the
// attributes is reliable and keeps this readable.

function parseTags(svg, tagName) {
  const tagRe = new RegExp(`<${tagName}\\s+([^>]*?)/?>`, "g");
  const attrRe = /([\w-]+)="([^"]*)"/g;
  const tags = [];
  let tagMatch;

  while ((tagMatch = tagRe.exec(svg))) {
    const attrs = {};
    let attrMatch;
    attrRe.lastIndex = 0;

    while ((attrMatch = attrRe.exec(tagMatch[1]))) {
      attrs[attrMatch[1]] = attrMatch[2];
    }

    tags.push(attrs);
  }

  return tags;
}

const num = (v) => (v === undefined ? undefined : Number(v));

// Shape into the same field names HENRY_GEOMETRY uses, so the two can be
// diffed with toEqual instead of eyeballing attribute names.
const circleGeom = (attrs) => {
  const g = { cx: num(attrs.cx), cy: num(attrs.cy), r: num(attrs.r) };
  if (attrs.opacity !== undefined) g.opacity = num(attrs.opacity);
  return g;
};

const rectGeom = (attrs) => ({
  x: num(attrs.x),
  y: num(attrs.y),
  w: num(attrs.width),
  h: num(attrs.height),
  rx: num(attrs.rx),
});

const masterCircles = parseTags(master, "circle").map((attrs) => ({
  attrs,
  geom: circleGeom(attrs),
}));

const masterRects = parseTags(master, "rect").map((attrs) => ({
  attrs,
  geom: rectGeom(attrs),
}));

// Halo is the circle with an `opacity` attribute; the ball sits at the same
// cx/cy but has no opacity; the remaining two circles are the eyes.
const haloEntry = masterCircles.find((c) => c.attrs.opacity !== undefined);

const ballEntry = masterCircles.find(
  (c) =>
    c.attrs.opacity === undefined &&
    c.geom.cx === haloEntry.geom.cx &&
    c.geom.cy === haloEntry.geom.cy,
);

const eyeEntries = masterCircles.filter(
  (c) => c !== haloEntry && c !== ballEntry,
);

// The master's ground rect (width="512") isn't part of Henry's own geometry;
// of the remaining two rects, the head is the wider one (width="300"), the
// stem the narrower (width="22").
const contentRects = masterRects
  .filter((r) => r.geom.w !== 512)
  .sort((a, b) => b.geom.w - a.geom.w);

const [headEntry, stemEntry] = contentRects;

describe("vendored master (drift guard)", () => {
  // origin and beadHole are seal-specific compositing values with no
  // counterpart in the master SVG — they can't be drift-checked against the
  // vendored file, so they're intentionally absent from the comparisons below.

  it("halo circle matches HENRY_GEOMETRY.halo", () => {
    expect(haloEntry.geom).toEqual(HENRY_GEOMETRY.halo);
  });

  it("antenna ball matches HENRY_GEOMETRY.ball", () => {
    expect(ballEntry.geom).toEqual(HENRY_GEOMETRY.ball);
  });

  it("both eye circles match HENRY_GEOMETRY.eyes", () => {
    expect(eyeEntries.map((c) => c.geom)).toEqual(HENRY_GEOMETRY.eyes);
  });

  it("stem rect matches HENRY_GEOMETRY.stem", () => {
    expect(stemEntry.geom).toEqual(HENRY_GEOMETRY.stem);
  });

  it("head rect matches HENRY_GEOMETRY.head", () => {
    expect(headEntry.geom).toEqual(HENRY_GEOMETRY.head);
  });
});

describe("henryGroup", () => {
  it("omits the master's ground rect — the seal supplies its own ground", () => {
    const g = henryGroup({
      cx: 256,
      cy: 232,
      scale: 0.47,
      ground: "#1b140c",
      bead: true,
    });

    expect(g).not.toContain('width="512" height="512"');
    expect(g).not.toContain("#111111");
  });

  it("renders every part of Henry's icon-form geometry with the expected fills", () => {
    const geo = HENRY_GEOMETRY;
    const accent = "#ffaa3c";

    const g = henryGroup({
      cx: 256,
      cy: 232,
      scale: 0.47,
      ground: "#1b140c",
      accent,
      bead: false,
    });

    expect(g).toContain(
      `<circle cx="${geo.halo.cx}" cy="${geo.halo.cy}" r="${geo.halo.r}" fill="${accent}" opacity="${geo.halo.opacity}"/>`,
    );

    expect(g).toContain(
      `<circle cx="${geo.ball.cx}" cy="${geo.ball.cy}" r="${geo.ball.r}" fill="${accent}"/>`,
    );

    expect(g).toContain(
      `<rect x="${geo.stem.x}" y="${geo.stem.y}" width="${geo.stem.w}" height="${geo.stem.h}" rx="${geo.stem.rx}" fill="#ffffff"/>`,
    );

    expect(g).toContain(
      `<rect x="${geo.head.x}" y="${geo.head.y}" width="${geo.head.w}" height="${geo.head.h}" rx="${geo.head.rx}" fill="#ffffff"/>`,
    );

    expect(g).toContain(
      `<circle cx="${geo.eyes[0].cx}" cy="${geo.eyes[0].cy}" r="${geo.eyes[0].r}" fill="${accent}"/>`,
    );

    expect(g).toContain(
      `<circle cx="${geo.eyes[1].cx}" cy="${geo.eyes[1].cy}" r="${geo.eyes[1].r}" fill="${accent}"/>`,
    );
  });

  it("adds the bead hole in the ground color when bead is true", () => {
    const g = henryGroup({
      cx: 256,
      cy: 232,
      scale: 0.47,
      ground: "#1b140c",
      bead: true,
    });

    expect(g).toContain('<circle cx="256" cy="112" r="11" fill="#1b140c"/>');
  });

  it("omits the bead hole when bead is false", () => {
    const g = henryGroup({
      cx: 256,
      cy: 232,
      scale: 0.47,
      ground: "#1b140c",
      bead: false,
    });

    expect(g).not.toContain('r="11"');
  });

  it("emits no text element", () => {
    const g = henryGroup({
      cx: 256,
      cy: 232,
      scale: 0.47,
      ground: "#1b140c",
      bead: true,
    });

    expect(g).not.toContain("<text");
  });

  it("places the group at the requested transform", () => {
    const g = henryGroup({
      cx: 300,
      cy: 200,
      scale: 0.5,
      ground: "#1b140c",
      bead: true,
    });

    expect(g).toContain("translate(300,200) scale(0.5) translate(-256,-238)");
  });
});
