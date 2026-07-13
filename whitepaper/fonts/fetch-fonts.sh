#!/usr/bin/env bash
# Re-download the bundled brand fonts from fontsource (jsDelivr CDN).
# Both families are SIL OFL 1.1 (see OFL.txt); redistribution is permitted.
# Run from the fonts/ directory: ./fetch-fonts.sh
set -euo pipefail
cd "$(dirname "$0")"

base="https://cdn.jsdelivr.net/fontsource/fonts"

# Fraunces (serif / display)
curl -fsSL "$base/fraunces@latest/latin-400-normal.ttf" -o Fraunces-Regular.ttf
curl -fsSL "$base/fraunces@latest/latin-500-normal.ttf" -o Fraunces-Medium.ttf
curl -fsSL "$base/fraunces@latest/latin-600-normal.ttf" -o Fraunces-SemiBold.ttf
curl -fsSL "$base/fraunces@latest/latin-400-italic.ttf" -o Fraunces-Italic.ttf

# IBM Plex Mono (labels, tables, identifiers)
curl -fsSL "$base/ibm-plex-mono@latest/latin-400-normal.ttf" -o IBMPlexMono-Regular.ttf
curl -fsSL "$base/ibm-plex-mono@latest/latin-500-normal.ttf" -o IBMPlexMono-Medium.ttf
curl -fsSL "$base/ibm-plex-mono@latest/latin-600-normal.ttf" -o IBMPlexMono-SemiBold.ttf

echo "Fonts downloaded:"
ls -1 *.ttf
