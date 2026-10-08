/**
 * Text -> outlined SVG path data.
 *
 * Every glyph becomes path geometry, so emitted SVGs carry no <text> element
 * and no font dependency at rasterization time. This mirrors the invariant
 * henry-mascot/scripts/generate.js enforces on its masters: rasterizing live
 * <text> through sharp requires fontconfig to resolve the family on the build
 * machine, and a box without it substitutes a fallback or renders blank —
 * silently.
 *
 * Roboto Mono ships no static SemiBold, so "bold" is 700 and "regular" is 400.
 * The face is monospaced, so advance widths are weight-independent and layout
 * math does not shift if a weight is swapped.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const FONT_FILES = {
  bold: "RobotoMono-Bold.ttf",
  regular: "RobotoMono-Regular.ttf",
};

const cache = new Map();

export function loadFont(weight) {
  const file = FONT_FILES[weight];

  if (!file) {
    throw new Error(
      `unknown weight "${weight}" — expected "bold" or "regular"`,
    );
  }

  if (!cache.has(weight)) {
    const full = path.join(HERE, "vendor", file);

    if (!fs.existsSync(full)) {
      throw new Error(`missing vendored font ${full} — see brand/README.md`);
    }

    cache.set(weight, opentype.loadSync(full));
  }

  return cache.get(weight);
}

function advanceOf(font, text, size, letterSpacing) {
  const chars = [...text];
  return font.getAdvanceWidth(text, size) + letterSpacing * (chars.length - 1);
}

/** A horizontal line of text, centered on cx, sitting on `baseline`. */
export function flatLine({
  font,
  text,
  cx,
  baseline,
  size,
  letterSpacing = 0,
}) {
  const chars = [...text];
  let x = cx - advanceOf(font, text, size, letterSpacing) / 2;
  let d = "";

  for (const ch of chars) {
    d += font.getPath(ch, x, baseline, size).toPathData(2);
    x += font.getAdvanceWidth(ch, size) + letterSpacing;
  }

  return d;
}

/**
 * Text along the top of a circle, reading left to right, each glyph rotated to
 * its tangent. The rotation is baked into the coordinates rather than emitted
 * as a transform, so the result is a single flat path with no grouping.
 */
export function arcLine({
  font,
  text,
  cx,
  cy,
  radius,
  size,
  letterSpacing = 0,
}) {
  const chars = [...text];

  const widths = chars.map(
    (c) => font.getAdvanceWidth(c, size) + letterSpacing,
  );

  // total intentionally includes the trailing letterSpacing: mid uses the
  // cell width (advance + letterSpacing) for its half-offset, and the two
  // compensate exactly. Changing either alone shifts every glyph by
  // letterSpacing/2.
  const total = widths.reduce((a, b) => a + b, 0);

  // sweep centered on 12 o'clock (-90deg), running clockwise = left to right
  let angle = -Math.PI / 2 - total / radius / 2;
  let d = "";

  chars.forEach((ch, i) => {
    const mid = angle + widths[i] / 2 / radius;
    const px = cx + radius * Math.cos(mid);
    const py = cy + radius * Math.sin(mid);
    const rot = mid + Math.PI / 2; // tangent
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);

    // draw the glyph centered on its own origin, then rotate+translate in place
    const p = font.getPath(ch, -font.getAdvanceWidth(ch, size) / 2, 0, size);

    for (const cmd of p.commands) {
      for (const [xk, yk] of [
        ["x", "y"],
        ["x1", "y1"],
        ["x2", "y2"],
      ]) {
        if (cmd[xk] === undefined) continue;
        const nx = cmd[xk] * cos - cmd[yk] * sin + px;
        const ny = cmd[xk] * sin + cmd[yk] * cos + py;
        cmd[xk] = nx;
        cmd[yk] = ny;
      }
    }

    d += p.toPathData(2);
    angle += widths[i] / radius;
  });

  return d;
}
