# BEADZ Whitepaper (Typst)

Source for the BEADZ whitepaper PDF. A readable, printable A4 rendering built
with [Typst](https://typst.app), styled to match the
[half-built-robots.com](https://half-built-robots.com) blog it's hosted on:
amber accents and Roboto Mono headings over a Roboto (sans) body.

## Build

Requires Typst **0.15+** on your PATH.

    ./build.sh            # macOS / Linux
    pwsh ./build.ps1      # Windows PowerShell

Both write `out/beadz-whitepaper.pdf`. Pass `--watch` / `-Watch` for continuous
rebuilds. The build uses `--font-path fonts`, so no font installation is needed.

## Layout

- `whitepaper.typ` â€” the document (front matter + prose).
- `template.typ` â€” theme: fonts, palette, title block, headings, tables, footer.
- `metadata.typ` â€” canonical facts (supply, symbol, decimals, chain, â€¦).
- `fonts/` â€” bundled brand fonts; see provenance below.

## Fonts & license

Bundled fonts are third-party assets; both licenses permit redistribution:

- **Roboto** (body: regular, italic, medium, medium italic, bold) — Google — Apache-2.0 (`fonts/LICENSE-Roboto.txt`)
- **Roboto Mono** (headings, labels, tables) — Google — Apache-2.0 (`fonts/LICENSE-Roboto-Mono.txt`)

Both are from the Roboto family; Roboto Mono matches the blog, which is set in
Roboto Mono. The body was Roboto Serif until 2026-10-08 and moved to Roboto
because the serif was hard to read in the PDF. Re-download the fonts with
`fonts/fetch-fonts.sh` (fetches from the fontsource CDN; the license files are
tracked and not fetched).
