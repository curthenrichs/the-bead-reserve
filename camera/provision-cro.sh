#!/usr/bin/env bash
# Optional CRO provisioning for Fault-Cam 01 — the Chief Reserve Officer VLM.
# Run ON THE PI, as the operator (not root; builds under $HOME by default):
#   bash camera/provision-cro.sh
# Idempotent. NOT part of provision.sh — a plain proof-of-reserves device never
# needs this. ~40 min one-time build on a Pi 3B+.
set -euo pipefail

LLAMA_DIR="${LLAMA_DIR:-$HOME/llama.cpp}"
CRO_DIR="${CRO_DIR:-$HOME/beadz-cro}"
MODEL_BASE="https://huggingface.co/ggml-org/SmolVLM-500M-Instruct-GGUF/resolve/main"
MODEL="SmolVLM-500M-Instruct-Q8_0.gguf"
MMPROJ="mmproj-SmolVLM-500M-Instruct-Q8_0.gguf"
# Pinned sha256s (match cro-bench/src/fetch.py — the values verified there).
MODEL_SHA="9d4612de6a42214499e301494a3ecc2be0abdd9de44e663bda63f1152fad1bf4"
MMPROJ_SHA="d1eb8b6b23979205fdf63703ed10f788131a3f812c7b1f72e0119d5d81295150"

echo "== apt build deps =="
if ! command -v apt-get >/dev/null 2>&1; then echo "FAIL: not an apt device" >&2; exit 1; fi
sudo apt-get install -y cmake build-essential git

echo "== build llama-server (NEON, from source) =="
if [ ! -x "$LLAMA_DIR/build/bin/llama-server" ]; then
    [ -d "$LLAMA_DIR/.git" ] || git clone --depth 1 https://github.com/ggml-org/llama.cpp "$LLAMA_DIR"
    cmake -S "$LLAMA_DIR" -B "$LLAMA_DIR/build" -DCMAKE_BUILD_TYPE=Release \
        -DLLAMA_CURL=OFF -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF
    cmake --build "$LLAMA_DIR/build" --target llama-server -j2
fi

echo "== fetch + verify model =="
mkdir -p "$CRO_DIR"
fetch() {  # name sha
    local f="$CRO_DIR/$1"
    if [ -f "$f" ] && echo "$2  $f" | sha256sum -c - >/dev/null 2>&1; then
        echo "ok $1"; return; fi
    curl -fL "$MODEL_BASE/$1" -o "$f.part"
    echo "$2  $f.part" | sha256sum -c - || { echo "FAIL: sha256 mismatch $1" >&2; rm -f "$f.part"; exit 1; }
    mv "$f.part" "$f"; echo "fetched $1"
}
fetch "$MODEL" "$MODEL_SHA"
fetch "$MMPROJ" "$MMPROJ_SHA"

echo "== done. set in /etc/beadz-camera/device.env: =="
echo "CRO_IMPL=smolvlm"
echo "CRO_SERVER_BIN=$LLAMA_DIR/build/bin/llama-server"
echo "CRO_MODEL_PATH=$CRO_DIR/$MODEL"
echo "CRO_MMPROJ_PATH=$CRO_DIR/$MMPROJ"
echo "(the beadz service user needs read access to these paths)"
