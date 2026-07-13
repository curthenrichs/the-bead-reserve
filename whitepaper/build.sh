#!/usr/bin/env bash
# Build the BEADZ whitepaper PDF. Pass --watch for continuous rebuilds.
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v typst >/dev/null 2>&1; then
  echo "error: 'typst' not found on PATH. Install Typst 0.15+ from https://github.com/typst/typst" >&2
  exit 1
fi

mkdir -p out
cmd="compile"
[ "${1:-}" = "--watch" ] && cmd="watch"
typst "$cmd" --font-path fonts whitepaper.typ out/beadz-whitepaper.pdf
