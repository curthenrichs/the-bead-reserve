/**
 * Henry's icon-form geometry, vendored from
 * henry-mascot/dist/half-built-robots-amber/henry-master.svg.
 *
 * Icon form (no outline) is correct for the seal because the seal ground is
 * dark, and Henry's first design rule is that the #555555 outline belongs to
 * light surfaces only — on a dark ground the white head IS the shape.
 *
 * The master's own <rect> ground is omitted here: the seal supplies a circular
 * ground of its own. The only addition is the bead hole, a concentric circle in
 * the ground color that turns the glowing antenna ball into a glass seed bead.
 *
 * These constants duplicate the vendored file's numbers so the composition can
 * reason about them. henry.test.mjs asserts the two agree, so an upstream
 * change that is re-vendored without updating here fails the suite.
 *
 * (256,238) is the master's visual center: the midpoint between the top of the
 * antenna halo (y=62) and the bottom of the head (y=414).
 */

export const HENRY_GEOMETRY = Object.freeze({
  origin: Object.freeze({ x: 256, y: 238 }),
  halo: Object.freeze({ cx: 256, cy: 112, r: 50, opacity: 0.22 }),
  ball: Object.freeze({ cx: 256, cy: 112, r: 32 }),
  beadHole: Object.freeze({ cx: 256, cy: 112, r: 11 }),
  stem: Object.freeze({ x: 245, y: 138, w: 22, h: 72, rx: 11 }),
  head: Object.freeze({ x: 106, y: 200, w: 300, h: 214, rx: 52 }),
  eyes: Object.freeze([
    Object.freeze({ cx: 196, cy: 304, r: 27 }),
    Object.freeze({ cx: 316, cy: 304, r: 27 }),
  ]),
});

/**
 * Henry as an SVG <g>, positioned and scaled.
 *
 * @param {object}  o
 * @param {number}  o.cx      centre x in the target canvas
 * @param {number}  o.cy      centre y in the target canvas
 * @param {number}  o.scale   scale factor applied to master units
 * @param {string}  o.ground  ground colour, used for the bead hole
 * @param {string}  o.accent  accent colour for eyes/ball/halo
 * @param {boolean} o.bead    whether the antenna tip is a bead (hole) or a ball
 * @param {string}  o.head    head/stem fill colour; callers own the single
 *                            source of truth (seal.mjs passes PALETTE.head)
 * @returns {string} SVG markup
 */
export function henryGroup({
  cx,
  cy,
  scale,
  ground,
  accent = "#ffaa3c",
  bead = true,
  head = "#ffffff",
}) {
  const g = HENRY_GEOMETRY;
  const o = g.origin;

  const beadHole = bead
    ? `\n    <circle cx="${g.beadHole.cx}" cy="${g.beadHole.cy}" r="${g.beadHole.r}" fill="${ground}"/>`
    : "";

  return `<g transform="translate(${cx},${cy}) scale(${scale}) translate(${-o.x},${-o.y})">
    <circle cx="${g.halo.cx}" cy="${g.halo.cy}" r="${g.halo.r}" fill="${accent}" opacity="${g.halo.opacity}"/>
    <circle cx="${g.ball.cx}" cy="${g.ball.cy}" r="${g.ball.r}" fill="${accent}"/>${beadHole}
    <rect x="${g.stem.x}" y="${g.stem.y}" width="${g.stem.w}" height="${g.stem.h}" rx="${g.stem.rx}" fill="${head}"/>
    <rect x="${g.head.x}" y="${g.head.y}" width="${g.head.w}" height="${g.head.h}" rx="${g.head.rx}" fill="${head}"/>
    <circle cx="${g.eyes[0].cx}" cy="${g.eyes[0].cy}" r="${g.eyes[0].r}" fill="${accent}"/>
    <circle cx="${g.eyes[1].cx}" cy="${g.eyes[1].cy}" r="${g.eyes[1].r}" fill="${accent}"/>
  </g>`;
}
