#!/usr/bin/env bash
# Re-download the bundled brand fonts from fontsource (jsDelivr CDN).
# Roboto is Apache-2.0 (see LICENSE-Roboto.txt) and so is Roboto Mono (see
# LICENSE-Roboto-Mono.txt). Both permit redistribution. The license files are
# tracked, not fetched (the CDN does not serve them).
# Run from the fonts/ directory: ./fetch-fonts.sh
set -euo pipefail
cd "$(dirname "$0")"

base="https://cdn.jsdelivr.net/fontsource/fonts"

# Roboto (body) - the sans from the same family, set for legibility at text
# sizes in the PDF.
curl -fsSL "$base/roboto@latest/latin-400-normal.ttf" -o Roboto-Regular.ttf
curl -fsSL "$base/roboto@latest/latin-400-italic.ttf" -o Roboto-Italic.ttf
curl -fsSL "$base/roboto@latest/latin-500-normal.ttf" -o Roboto-Medium.ttf
curl -fsSL "$base/roboto@latest/latin-500-italic.ttf" -o Roboto-MediumItalic.ttf
curl -fsSL "$base/roboto@latest/latin-700-normal.ttf" -o Roboto-Bold.ttf
curl -fsSL "$base/roboto@latest/LICENSE" -o LICENSE-Roboto.txt

# Roboto Mono (headings, labels, tables, identifiers) — matches the
# half-built-robots.com blog, which is set in Roboto Mono.
curl -fsSL "$base/roboto-mono@latest/latin-400-normal.ttf" -o RobotoMono-Regular.ttf
curl -fsSL "$base/roboto-mono@latest/latin-500-normal.ttf" -o RobotoMono-Medium.ttf
curl -fsSL "$base/roboto-mono@latest/latin-700-normal.ttf" -o RobotoMono-Bold.ttf
curl -fsSL "$base/roboto-mono@latest/latin-400-italic.ttf" -o RobotoMono-RegularItalic.ttf

echo "Fonts downloaded:"
ls -1 *.ttf
