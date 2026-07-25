# BEADZ brand assets

The reserve seal: a circular institutional mark with Henry at its center. One
composition produces the token logo, the favicon set, and the OG image.

## Regenerating

    npm run brand:build

Outputs land in `site/public/`. Never hand-edit them — change the composition
in `seal.mjs` and regenerate.

## Layout

| File | Responsibility |
|---|---|
| `lettering.mjs` | text → outlined SVG path data. Knows fonts, not BEADZ. |
| `henry.mjs` | vendored character geometry + the bead tip. Knows Henry, not the seal. |
| `seal.mjs` | composes both, owns the copy and the palette. |
| `build.mjs` | rasterizes and verifies into `site/public/`. |
| `vendor/` | the Henry master SVG and third-party font files, copied verbatim. Not the only vendored Henry assets in this repo — see "The CRO illustrations" below. |

## The vendoring rule

Henry is **vendored, never re-authored**. `vendor/henry-master.svg` is a verbatim
copy of `henry-mascot/dist/half-built-robots-amber/henry-master.svg`. The seal
draws its child elements at a transform and omits the ground rect, supplying its
own circular ground.

To pick up upstream changes, re-copy the file. Do not edit it here, and do not
redraw Henry from measurements — the mascot repo is the single source of truth
for the character.

`henry.test.mjs` asserts the vendored geometry still matches the values the seal
composes against, so upstream drift fails the test suite rather than silently
shipping a broken mark.

## No fonts at rasterization time

Every emitted SVG contains **zero `<text>` elements**. Glyphs are converted to
outlined paths at build time by `opentype.js`.

This mirrors the invariant `henry-mascot/scripts/generate.js` enforces on its own
masters. Rasterizing live `<text>` through `sharp` requires fontconfig to resolve
the family on the build machine; a CI box without Roboto Mono installed
substitutes a fallback or renders blank, and does so silently. Outlining removes
the failure mode entirely.

## Fonts

Roboto Mono, OFL-1.1 (`vendor/OFL.txt`). Upstream ships **no static SemiBold**,
so the mark uses:

- **Bold (700)** — rim lettering and the count
- **Regular (400)** — the `ERC-20 · BASE` line

The face is monospaced, so advance widths are weight-independent: swapping a
weight does not shift the layout math.

## Small sizes are redrawn, not scaled

`sealSvg({ lettering: false })` is a separate composition for 16/32px: the rim
lettering is dropped, the ring thickens, and Henry grows. At favicon sizes the
rim type turns to mush, and a scaled-down full mark reads as an amber smudge.

The consequence is deliberate: **the favicon carries the mark but not the joke.**
The deadpan needs legible rim lettering, which needs roughly 96px. It lands on
the token logo and the OG image.

## The CRO illustrations (vendored outside brand/)

`site/public/henry-cro-broadcasting.svg`, `site/public/henry-cro-signal-lost.svg`,
and `site/public/henry-cro-low-battery.svg` are also vendored Henry artwork, but
they live in `site/public/`, not `site/brand/vendor/`, because they are consumed
directly by the site (the `CameraMonitor` island) rather than composed by
`seal.mjs`.

They are verbatim copies of upstream illustration-form SVGs from the mascot
repo, renamed on copy:

| Upstream (`henry-mascot/dist/half-built-robots-amber/`) | Vendored as |
|---|---|
| `henry-illustration-broadcasting.svg` | `site/public/henry-cro-broadcasting.svg` |
| `henry-illustration-signal-lost.svg` | `site/public/henry-cro-signal-lost.svg` |
| `henry-illustration-low-battery.svg` | `site/public/henry-cro-low-battery.svg` |

They are refreshed by re-copying from that upstream path, exactly like
`vendor/henry-master.svg`. Unlike the master, **there is no automated drift
guard for these three files** — a true guard would have to compare against
the mascot repo's checked-out contents, which is not present in this repo's
CI, so no such check exists here. If upstream changes, these three files must
be re-copied and renamed by hand; nothing in this repository will notice on
its own if they go stale.

## Licensing

Henry is © Curt Henrichs, all rights reserved, and is excluded from this
repository's MIT grant — see the BRAND ASSETS EXCEPTION in the root `LICENSE`.
Fonts in `vendor/` are governed by the OFL instead.
