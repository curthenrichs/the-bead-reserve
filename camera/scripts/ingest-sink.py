#!/usr/bin/env python3
"""Run the local ingest sink — watch a real Pi push over the LAN.

Requires the package installed (from camera/: `pip install -e .`).

Example:
    python scripts/ingest-sink.py --port 8080 --bind 0.0.0.0 \\
        --env /path/to/device.env --pubkey-file /path/to/ed25519.pub
Then set the Pi's INGEST_URL to http://<this-machine's-LAN-IP>:8080/api/ingest
"""

from __future__ import annotations

import argparse
import time
from pathlib import Path

from dotenv import dotenv_values

from beadz_camera.sink import IngestSink


def main() -> int:
    p = argparse.ArgumentParser(description="Local ingest sink (contract reference)")
    p.add_argument("--port", type=int, default=8080)
    p.add_argument("--bind", default="0.0.0.0",
                   help="bind address (default 0.0.0.0 for LAN use)")
    secret_g = p.add_mutually_exclusive_group(required=True)
    secret_g.add_argument("--secret", help="HMAC shared secret")
    secret_g.add_argument("--env", type=Path,
                          help="device.env-shaped file; reads HMAC_SECRET")
    key_g = p.add_mutually_exclusive_group(required=True)
    key_g.add_argument("--pubkey", help="Ed25519 public key, hex")
    key_g.add_argument("--pubkey-file", type=Path, help="path to ed25519.pub")
    p.add_argument("--sink-dir", type=Path, default=Path("./sink-state"))
    args = p.parse_args()

    secret = args.secret or dotenv_values(args.env).get("HMAC_SECRET") or ""
    if not secret:
        p.error("no HMAC_SECRET found (empty --secret / missing in --env file)")
    pubkey = args.pubkey or args.pubkey_file.read_text().strip()

    sink = IngestSink(secret, pubkey, args.sink_dir, port=args.port, bind=args.bind)
    sink.start()
    print(f"ingest sink listening on {sink.url}")
    if args.bind == "0.0.0.0":
        print("  (for the Pi's INGEST_URL, replace 0.0.0.0 with this machine's LAN IP)")
    print(f"frames -> {args.sink_dir / 'frames'}   Ctrl-C to stop")
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        print("\nstopping")
        sink.stop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
