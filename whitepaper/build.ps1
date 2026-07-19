# Build the BEADZ whitepaper PDF.
#
# Usage:
#   ./build.ps1            one-shot compile
#   ./build.ps1 -Watch     recompile on every source change
#
# Requires: Typst 0.15+ on PATH (https://github.com/typst/typst).
# Fonts are bundled in ./fonts; no system font install needed.
# Output: out/beadz-whitepaper.pdf — tagged PDF conforming to PDF/UA-1
# (accessibility violations, e.g. missing alt text, fail the build).

param([switch]$Watch)
$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

if (-not (Get-Command typst -ErrorAction SilentlyContinue)) {
    Write-Error "'typst' not found on PATH. Install Typst 0.15+ from https://github.com/typst/typst"
    exit 1
}

if (-not (Test-Path out)) { New-Item -ItemType Directory out | Out-Null }
$cmd = if ($Watch) { "watch" } else { "compile" }
typst $cmd --pdf-standard ua-1 --font-path fonts whitepaper.typ out/beadz-whitepaper.pdf
