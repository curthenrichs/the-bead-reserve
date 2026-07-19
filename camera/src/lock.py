"""Cross-process exclusive lock over the state dir.

capture-once and push-drain are independent systemd one-shots whose timers
both fire at the top of the hour; every state-dir mutation happens under this
lock. Kernel-managed (flock on POSIX, msvcrt.locking on Windows): released
automatically on process exit or crash — no stale-lock files, no PID
heuristics. Blocking acquire with no timeout: both holders are short-lived
one-shots (worst case ~200 s for a full drain batch), far below the 3600 s
capture budget."""

from __future__ import annotations

import os
import time
from contextlib import contextmanager
from pathlib import Path

if os.name == "nt":
    import msvcrt

    fcntl = None

    def _acquire(fd: int) -> None:
        # msvcrt's LK_LOCK gives up after ~10 s; retry until acquired
        while True:
            try:
                os.lseek(fd, 0, os.SEEK_SET)
                msvcrt.locking(fd, msvcrt.LK_LOCK, 1)
                return
            except OSError:
                time.sleep(0.1)

    def _release(fd: int) -> None:
        os.lseek(fd, 0, os.SEEK_SET)
        msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)

else:
    import fcntl

    def _acquire(fd: int) -> None:
        fcntl.flock(fd, fcntl.LOCK_EX)

    def _release(fd: int) -> None:
        fcntl.flock(fd, fcntl.LOCK_UN)


@contextmanager
def state_lock(state_dir: Path):
    state_dir = Path(state_dir)
    state_dir.mkdir(parents=True, exist_ok=True)
    fd = os.open(state_dir / ".lock", os.O_CREAT | os.O_RDWR)
    try:
        _acquire(fd)
        try:
            yield
        finally:
            _release(fd)
    finally:
        os.close(fd)
