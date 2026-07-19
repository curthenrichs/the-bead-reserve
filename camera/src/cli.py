"""Entry points: the two one-shot pipeline commands plus bring-up helpers.

capture-once (hourly timer):  capture -> crop/strip -> hash -> sign -> CRO,
all on tmpfs and OUTSIDE the state lock (the CRO may one day take minutes);
then, under the lock: counter -> enqueue -> status. The counter is not part
of the signed material, so allocating it after signing is sound.
push-drain (5-min timer):     the whole drain + status, under the lock.

Exit codes: 0 success · 1 pipeline failure · 2 config error · 3 already
initialized (benign rerun of keygen/seed-counter). Handled paths never print
a traceback; status.json records every pipeline failure."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from .capture import CaptureError, capture_frame
from .config import Config, ConfigError
from .cro import get_cro
from .lock import state_lock
from .process import ProcessError, crop_and_strip
from .push import PushError, drain
from .queue import CounterError, StateDir
from .sign import generate_keypair, load_signing_key, sha256_file, sign_hash
from .status import update_status


class AlreadyInitialized(RuntimeError):
    pass


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
    try:
        pub = generate_keypair(cfg.key_path)
    except FileExistsError as exc:
        raise AlreadyInitialized(f"key already present: {cfg.key_path}") from exc
    print(f"public key (publish this): {pub}")
    return 0


def _cmd_seed_counter(cfg: Config, value: int, force: bool) -> int:
    with state_lock(cfg.state_dir):
        try:
            StateDir(cfg.state_dir).seed_counter(value, force=force)
        except FileExistsError as exc:
            raise AlreadyInitialized(
                "counter already seeded (seed-counter --force re-seeds after corruption)"
            ) from exc
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
            digest = sha256_file(final)
            sig = sign_hash(load_signing_key(cfg.key_path), digest)
            cro_text = get_cro().audit(final)
            with state_lock(cfg.state_dir):
                counter = state.next_counter()
                state.enqueue(counter, final, {
                    "counter": counter,
                    "ts": int(time.time()),
                    "sha256": digest,
                    "sig": sig,
                    "croText": cro_text,
                })
                update_status(cfg.state_dir, last_capture_ok=True, last_error=None,
                              last_counter=counter, queue_depth=len(state.pending()),
                              ntp_synced=_ntp_synced())
    except (CaptureError, ProcessError, CounterError, ValueError, OSError) as exc:
        with state_lock(cfg.state_dir):
            update_status(cfg.state_dir, last_capture_ok=False, last_error=str(exc),
                          ntp_synced=_ntp_synced())
        print(f"capture-once failed: {exc}", file=sys.stderr)
        return 1
    return 0


def _cmd_push_drain(cfg: Config) -> int:
    state = StateDir(cfg.state_dir)
    try:
        with state_lock(cfg.state_dir):
            report = drain(cfg, state)
            update_status(cfg.state_dir, last_push_ok=not report["failed"],
                          queue_depth=report["remaining"],
                          last_push_report=report)
    except (CounterError, PushError, OSError) as exc:
        with state_lock(cfg.state_dir):
            update_status(cfg.state_dir, last_push_ok=False, last_error=str(exc))
        print(f"push-drain failed: {exc}", file=sys.stderr)
        return 1
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
    seed.add_argument("--force", action="store_true",
                      help="re-seed even if a counter file exists (corruption "
                           "recovery); value must EXCEED the highest counter "
                           "the backend has seen")
    sub.add_parser("capture-once")
    sub.add_parser("push-drain")
    args = parser.parse_args(argv)

    try:
        cfg = Config.from_env(args.env)
        if args.command == "keygen":
            return _cmd_keygen(cfg)
        if args.command == "seed-counter":
            return _cmd_seed_counter(cfg, args.value, args.force)
        if args.command == "capture-once":
            return _cmd_capture_once(cfg)
        return _cmd_push_drain(cfg)
    except ConfigError as exc:
        print(f"config error: {exc}", file=sys.stderr)
        return 2
    except AlreadyInitialized as exc:
        print(str(exc), file=sys.stderr)
        return 3
    except (CaptureError, ProcessError, CounterError, PushError,
            ValueError, OSError) as exc:
        # backstop: no handled path ever prints a traceback
        print(f"{args.command} failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
