#!/usr/bin/env bash
# Re-download the bundled brand fonts from fontsource (jsDelivr CDN).
# Roboto Serif is SIL OFL 1.1 (see OFL.txt); Roboto Mono is Apache-2.0 (see
# LICENSE-Roboto-Mono.txt). Both permit redistribution.
# Run from the fonts/ directory: ./fetch-fonts.sh
set -euo pipefail
cd "$(dirname "$0")"

base="https://cdn.jsdelivr.net/fontsource/fonts"

# Roboto Serif (body) — a clean text serif from the Roboto family, pairing
# with Roboto Mono below.
curl -fsSL "$base/roboto-serif@latest/latin-400-normal.ttf" -o RobotoSerif-Regular.ttf
curl -fsSL "$base/roboto-serif@latest/latin-500-normal.ttf" -o RobotoSerif-Medium.ttf
curl -fsSL "$base/roboto-serif@latest/latin-600-normal.ttf" -o RobotoSerif-SemiBold.ttf
curl -fsSL "$base/roboto-serif@latest/latin-400-italic.ttf" -o RobotoSerif-Italic.ttf

# Roboto Mono (headings, labels, tables, identifiers) — matches the
# half-built-robots.com blog, which is set in Roboto Mono.
curl -fsSL "$base/roboto-mono@latest/latin-400-normal.ttf" -o RobotoMono-Regular.ttf
curl -fsSL "$base/roboto-mono@latest/latin-500-normal.ttf" -o RobotoMono-Medium.ttf
curl -fsSL "$base/roboto-mono@latest/latin-700-normal.ttf" -o RobotoMono-Bold.ttf
curl -fsSL "$base/roboto-mono@latest/latin-400-italic.ttf" -o RobotoMono-RegularItalic.ttf

echo "Fonts downloaded:"
ls -1 *.ttf
