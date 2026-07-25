/**
 * The BEADZ reserve seal.
 *
 * A circular institutional mark: curved top rim, Henry at the centre, two flat
 * level lines beneath. Only the top rim curves — every other line is strictly
 * horizontal, and no arc runs right-to-left, so no glyph is ever inverted.
 *
 * Two forms:
 *   lettering: true   the full mark, for 96px and up
 *   lettering: false  the small redraw for 16/32, ring + Henry only
 *
 * The small form is a REDRAW, not a scale: at favicon sizes the rim type turns
 * to mush, so it is dropped, the ring thickens, and Henry grows. This follows
 * Henry's own rule that small sizes are redrawn rather than scaled. The
 * consequence is deliberate: the favicon carries the mark but not the joke.
 *
 * The Genesis Count 47,318 is permanent — it refers to genesis, never to live
 * supply, which only ever shrinks through redemption.
 */
import { loadFont, flatLine, arcLine } from "./lettering.mjs";
import { henryGroup } from "./henry.mjs";

export const PALETTE = Object.freeze({
  ground: "#1b140c",
  accent: "#ffaa3c",
  accentSoft: "#ffc46e",
  head: "#ffffff",
});

export const COPY = Object.freeze({
  rim: "THE BEAD RESERVE",
  count: "· 47,318 ·",
  chain: "ERC-20 · BASE",
});

// Tuned against rendered output at each target size; see brand/README.md.
const FULL = Object.freeze({
  ringR: 240, ringW: 5, hairlineR: 229, hairlineW: 2, hairlineOpacity: 0.45,
  rimRadius: 196, rimSize: 34, rimTracking: 7,
  henryScale: 0.47, henryY: 232,
  countBaseline: 386, countSize: 27, countTracking: 6,
  chainBaseline: 422, chainSize: 20, chainTracking: 6,
});

const SMALL = Object.freeze({
  ringR: 232, ringW: 22,
  henryScale: 0.62, henryY: 256,
});

export function sealSvg({ lettering = true } = {}) {
  const cfg = lettering ? FULL : SMALL;

  const ring = `<circle cx="256" cy="256" r="${cfg.ringR}" fill="none" stroke="${PALETTE.accent}" stroke-width="${cfg.ringW}"/>`;

  const hairline = lettering
    ? `\n  <circle cx="256" cy="256" r="${FULL.hairlineR}" fill="none" stroke="${PALETTE.accent}" stroke-width="${FULL.hairlineW}" opacity="${FULL.hairlineOpacity}"/>`
    : "";

  let type = "";
  if (lettering) {
    const bold = loadFont("bold");
    const regular = loadFont("regular");

    const rim = arcLine({
      font: bold, text: COPY.rim, cx: 256, cy: 256,
      radius: FULL.rimRadius, size: FULL.rimSize, letterSpacing: FULL.rimTracking,
    });
    const count = flatLine({
      font: bold, text: COPY.count, cx: 256,
      baseline: FULL.countBaseline, size: FULL.countSize, letterSpacing: FULL.countTracking,
    });
    const chain = flatLine({
      font: regular, text: COPY.chain, cx: 256,
      baseline: FULL.chainBaseline, size: FULL.chainSize, letterSpacing: FULL.chainTracking,
    });

    type =
      `\n  <path d="${rim}" fill="${PALETTE.accent}"/>` +
      `\n  <path d="${count}" fill="${PALETTE.accent}"/>` +
      `\n  <path d="${chain}" fill="${PALETTE.accentSoft}"/>`;
  }

  const henry = henryGroup({
    cx: 256, cy: cfg.henryY, scale: cfg.henryScale,
    ground: PALETTE.ground, accent: PALETTE.accent, bead: true,
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <circle cx="256" cy="256" r="256" fill="${PALETTE.ground}"/>
  ${ring}${hairline}
  ${henry}${type}
</svg>
`;
}
