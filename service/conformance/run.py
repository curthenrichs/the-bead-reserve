"""Conformance runner: fire the ingest-sink's five scenarios at a live Worker.

Reuses the device's own crypto (beadz_camera) so the bytes are authoritative.
Requires: pip install -e ../camera  (in the same venv).
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import sys
import time
from pathlib import Path

import requests

from beadz_camera.push import hmac_hex
from beadz_camera.sign import export_pubkey, generate_keypair, load_signing_key, sign_hash


def body(key_path: Path, counter: int, image: bytes = b"jpegbytes",
         sha: str | None = None, sig: str | None = None, ts: int | None = None) -> bytes:
    digest = hashlib.sha256(image).hexdigest() if sha is None else sha
    signature = sign_hash(load_signing_key(key_path), digest) if sig is None else sig
    return json.dumps({
        "counter": counter, "ts": int(time.time()) if ts is None else ts,
        "sha256": digest, "sig": signature, "croText": None,
        "image_b64": base64.b64encode(image).decode(),
    }).encode()


def post(url: str, secret: str, raw: bytes, mac: str | None = None) -> requests.Response:
    return requests.post(url, data=raw, timeout=15, headers={
        "Content-Type": "application/json",
        "X-Beadz-Mac": hmac_hex(secret, raw) if mac is None else mac,
        "X-Beadz-Client": "beadz-conformance/0",
        "X-Beadz-Protocol": "1",
    })


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True, help="ingest URL, e.g. http://localhost:8787/api/ingest")
    ap.add_argument("--secret", required=True)
    ap.add_argument("--key", required=True, type=Path, help="ed25519.key (its .pub must be the Worker's ED25519_PUBKEY)")
    args = ap.parse_args()

    pubkey = generate_keypair(args.key) if not args.key.exists() else export_pubkey(args.key)
    print("ED25519_PUBKEY =", pubkey, "(set this in wrangler.toml [vars])")
    base = int(time.time())  # unique high counters so a re-run against a persistent Worker still works
    results: list[tuple[str, bool]] = []

    def check(name: str, cond: bool):
        results.append((name, cond))
        print(f"{'PASS' if cond else 'FAIL'}  {name}")

    # 1. happy path x3 in order
    ok = all(post(args.url, args.secret, body(args.key, base + i)).status_code == 200 for i in (1, 2, 3))
    check("happy x3 -> 200", ok)
    # 2. replay
    check("replay -> 409", post(args.url, args.secret, body(args.key, base + 2)).status_code == 409)
    # 3. tamper (wrong hash for the bytes)
    r = post(args.url, args.secret, body(args.key, base + 4, sha="ab" * 32))
    check("tamper -> 400 bad_signature", r.status_code == 400 and r.json().get("error") == "bad_signature")
    # 4. bad MAC
    r = post(args.url, args.secret, body(args.key, base + 5), mac="0" * 64)
    check("bad mac -> 401 bad_mac", r.status_code == 401 and r.json().get("error") == "bad_mac")
    # 5. unsupported protocol -> 400 (the row A2 added; verifies the Worker matches)
    raw = body(args.key, base + 6)
    r = requests.post(args.url, data=raw, timeout=15, headers={
        "X-Beadz-Mac": hmac_hex(args.secret, raw), "X-Beadz-Protocol": "99"})
    check("unsupported protocol -> 400", r.status_code == 400 and r.json().get("error") == "unsupported_protocol")

    passed = all(ok for _, ok in results)
    print(f"\n{'ALL PASS' if passed else 'FAILURES'}: {sum(ok for _, ok in results)}/{len(results)}")
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
