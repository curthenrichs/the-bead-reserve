"""Entry points: the two one-shot pipeline commands plus bring-up helpers.

capture-once (hourly timer):  capture -> crop/strip -> counter -> hash ->
sign -> CRO -> enqueue -> status.
push-drain (5-min timer):     drain queue oldest-first -> archive -> status.
Raw frames live only in a TemporaryDirectory (tmpfs on the Pi)."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from .capture import CaptureError, capture_frame
from .config import Config
from .cro import get_cro
from .process import ProcessError, crop_and_strip
from .push import drain
from .queue import CounterError, StateDir
from .sign import generate_keypair, load_signing_key, sha256_file, sign_hash
from .status import update_status


def _ntp_synced() -> bool | None:
    """Best-effort NTP check; None where timedatectl is unavailable."""
    try:
        out = subprocess.run(
            ["timedatectl", "show", "-p", "NTPSynchronized", "--value"],
            capture_output=True, timeout=5,
        )
        return out.stdout.decode().strip() == "yes"
    except (OSError, subprocess.TimeoutExpired):
        return None


def _cmd_keygen(cfg: Config) -> int:
    pub = generate_keypair(cfg.key_path)
    print(f"public key (publish this): {pub}")
    return 0


def _cmd_seed_counter(cfg: Config, value: int) -> int:
    StateDir(cfg.state_dir).seed_counter(value)
    print(f"counter seeded at {value}")
    return 0


def _cmd_capture_once(cfg: Config) -> int:
    state = StateDir(cfg.state_dir)
    try:
        with tempfile.TemporaryDirectory() as tmp:
            raw = Path(tmp) / "raw.jpg"
            final = Path(tmp) / "final.jpg"
            capture_frame(cfg.camera_device, raw)
            crop_and_strip(raw, final, cfg.crop_rect)
            counter = state.next_counter()
            digest = sha256_file(final)
            sig = sign_hash(load_signing_key(cfg.key_path), digest)
            cro_text = get_cro().audit(final)
            state.enqueue(counter, final, {
                "counter": counter,
                "ts": int(time.time()),
                "sha256": digest,
                "sig": sig,
                "croText": cro_text,
            })
    except (CaptureError, ProcessError, CounterError, OSError) as exc:
        update_status(cfg.state_dir, last_capture_ok=False, last_error=str(exc),
                      ntp_synced=_ntp_synced())
        print(f"capture-once failed: {exc}", file=sys.stderr)
        return 1
    update_status(cfg.state_dir, last_capture_ok=True, last_error=None,
                  last_counter=counter, queue_depth=len(state.pending()),
                  ntp_synced=_ntp_synced())
    return 0


def _cmd_push_drain(cfg: Config) -> int:
    state = StateDir(cfg.state_dir)
    report = drain(cfg, state)
    update_status(cfg.state_dir, last_push_ok=not report["failed"],
                  queue_depth=report["remaining"],
                  last_push_report=report)
    if report["failed"]:
        print(f"push-drain stopped on failure: {json.dumps(report)}", file=sys.stderr)
        return 1
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="beadz-camera")
    parser.add_argument("--env", type=Path, default=Path("device.env"),
                        help="path to device.env")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("keygen")
    seed = sub.add_parser("seed-counter")
    seed.add_argument("--value", type=int, default=0)
    sub.add_parser("capture-once")
    sub.add_parser("push-drain")
    args = parser.parse_args(argv)

    cfg = Config.from_env(args.env)
    if args.command == "keygen":
        return _cmd_keygen(cfg)
    if args.command == "seed-counter":
        return _cmd_seed_counter(cfg, args.value)
    if args.command == "capture-once":
        return _cmd_capture_once(cfg)
    return _cmd_push_drain(cfg)


if __name__ == "__main__":
    raise SystemExit(main())
