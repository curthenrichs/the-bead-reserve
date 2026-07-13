# Build the BEADZ whitepaper PDF. Pass -Watch for continuous rebuilds.
param([switch]$Watch)
$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

if (-not (Get-Command typst -ErrorAction SilentlyContinue)) {
    Write-Error "'typst' not found on PATH. Install Typst 0.15+ from https://github.com/typst/typst"
    exit 1
}

if (-not (Test-Path out)) { New-Item -ItemType Directory out | Out-Null }
$cmd = if ($Watch) { "watch" } else { "compile" }
typst $cmd --font-path fonts whitepaper.typ out/beadz-whitepaper.pdf
