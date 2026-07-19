#!/usr/bin/env bash
# Build the BEADZ whitepaper PDF.
#
# Usage:
#   ./build.sh             one-shot compile
#   ./build.sh --watch     recompile on every source change
#
# Requires: Typst 0.15+ on PATH (https://github.com/typst/typst).
# Fonts are bundled in ./fonts; no system font install needed.
# Output: out/beadz-whitepaper.pdf — tagged PDF conforming to PDF/UA-1
# (accessibility violations, e.g. missing alt text, fail the build).

set -euo pipefail
cd "$(dirname "$0")"

if ! command -v typst >/dev/null 2>&1; then
  echo "error: 'typst' not found on PATH. Install Typst 0.15+ from https://github.com/typst/typst" >&2
  exit 1
fi

mkdir -p out
cmd="compile"
[ "${1:-}" = "--watch" ] && cmd="watch"
typst "$cmd" --pdf-standard ua-1 --font-path fonts whitepaper.typ out/beadz-whitepaper.pdf
