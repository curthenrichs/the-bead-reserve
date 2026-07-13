# BEADZ Whitepaper (Typst)

Source for the BEADZ whitepaper PDF. A readable, printable A4 rendering built
with [Typst](https://typst.app), styled to match the
[half-built-robots.com](https://half-built-robots.com) blog it's hosted on:
amber accents and Roboto Mono headings over a Fraunces serif body.

## Build

Requires Typst **0.15+** on your PATH.

    ./build.sh            # macOS / Linux
    pwsh ./build.ps1      # Windows PowerShell

Both write `out/beadz-whitepaper.pdf`. Pass `--watch` / `-Watch` for continuous
rebuilds. The build uses `--font-path fonts`, so no font installation is needed.

## Layout

- `whitepaper.typ` — the document (front matter + prose).
- `template.typ` — theme: fonts, palette, title block, headings, tables, footer.
- `metadata.typ` — canonical facts (supply, symbol, decimals, chain, …).
- `fonts/` — bundled brand fonts; see provenance below.

## Fonts & license

Bundled fonts are third-party assets; both licenses permit redistribution:

- **Fraunces** (serif body) — The Undercase Type Company — SIL OFL 1.1 (`fonts/OFL.txt`)
- **Roboto Mono** (headings, labels, tables) — Google — Apache-2.0 (`fonts/LICENSE-Roboto-Mono.txt`)

Roboto Mono matches the blog, which is set in Roboto Mono. Re-download both
with `fonts/fetch-fonts.sh` (fetches from the fontsource CDN).
