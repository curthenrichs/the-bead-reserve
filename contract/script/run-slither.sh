#!/usr/bin/env bash
# Bootstraps the Slither toolchain and runs the Beadz detector policy
# (slither.config.json). Works on Linux, macOS, and Windows (Git Bash).
#
# Usage:  bash script/run-slither.sh [--gate]
#   (no args)  full run; findings report tee'd to $TMPDIR/beadz-slither.txt
#   --gate     additionally run the publish gate (--fail-medium) and report
#              "gate exit=N" (0 = no Medium/High findings)
#
# Detector settings live ONLY in slither.config.json — this script holds
# toolchain bootstrap, never policy.
set -uo pipefail

cd "$(dirname "$0")/.."

# Pick a Python >= 3.8, preferring one that already has slither installed so we
# never install a second copy into a different interpreter's site-packages
# (Windows machines commonly have several Pythons: python3, python, py).
PY=""
for cand in python3 python py; do
    command -v "$cand" >/dev/null 2>&1 || continue
    "$cand" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)' 2>/dev/null || continue
    if "$cand" -c 'import slither' >/dev/null 2>&1; then PY="$cand"; break; fi
    [ -n "$PY" ] || PY="$cand"
done
[ -n "$PY" ] || { echo "no python >= 3.8 found"; exit 1; }

# pip's console-scripts dirs are often off PATH (notably the per-user scheme on
# Windows and macOS). Resolve them for the CHOSEN interpreter via sysconfig —
# never by globbing install dirs, which can pick a different Python version.
# One PATH append per line: Windows paths contain ':' and cannot be colon-joined.
# Strip trailing \r: Python on Windows emits \r\n, and a CR-tailed PATH entry
# silently never matches.
while IFS= read -r d; do
    d="${d%$'\r'}"
    [ -n "$d" ] && PATH="$PATH:$d"
done <<EOF
$("$PY" -c 'import sysconfig
for s in ("posix_user", "osx_framework_user", "nt_user"):
    if s in sysconfig.get_scheme_names():
        print(sysconfig.get_path("scripts", s))
print(sysconfig.get_path("scripts"))' 2>/dev/null)
EOF
export PATH="$HOME/.foundry/bin:$PATH"

# Toolchain (idempotent)
command -v slither >/dev/null 2>&1 || "$PY" -m pip install slither-analyzer solc-select
command -v slither >/dev/null 2>&1 || { echo "slither install failed (see pip output above)"; exit 1; }
solc-select install 0.8.24 >/dev/null 2>&1
solc-select use 0.8.24 >/dev/null 2>&1 || { echo "solc-select failed"; exit 1; }

git submodule update --init --recursive

REPORT="${TMPDIR:-/tmp}/beadz-slither.txt"
echo "== slither run (report: $REPORT)"
slither . --config-file slither.config.json 2>&1 | tee "$REPORT"
echo "run exit=${PIPESTATUS[0]} (nonzero just means findings exist; read the report)"

if [ "${1:-}" = "--gate" ]; then
    echo "== publish gate (--fail-medium)"
    slither . --config-file slither.config.json --fail-medium >/dev/null 2>&1
    echo "gate exit=$? (0 = no Medium/High findings)"
fi
