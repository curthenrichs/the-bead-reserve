# BEADZ Whitepaper (Typst)

Source for the BEADZ whitepaper PDF. Clean, typographic A4 rendering built with
[Typst](https://typst.app).

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

Bundled fonts are third-party assets under the SIL Open Font License 1.1
(`fonts/OFL.txt`); redistribution is permitted:

- **Fraunces** — The Undercase Type Company
- **IBM Plex Mono** — IBM Corp.

Re-download with `fonts/fetch-fonts.sh` (fetches from the fontsource CDN).
