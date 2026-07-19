import os
import subprocess
import sys
import time

import pytest

from beadz_camera.lock import state_lock

HOLDER = """
import sys, time
from pathlib import Path
from beadz_camera.lock import state_lock
with state_lock(Path(sys.argv[1])):
    print("held", flush=True)
    time.sleep(float(sys.argv[2]))
"""


def test_acquire_release_reacquire(tmp_path):
    with state_lock(tmp_path / "state"):
        pass
    with state_lock(tmp_path / "state"):
        pass  # no deadlock, lock file reusable
    assert (tmp_path / "state" / ".lock").exists()


def test_blocks_until_holder_exits(tmp_path):
    script = tmp_path / "holder.py"
    script.write_text(HOLDER)
    proc = subprocess.Popen(
        [sys.executable, str(script), str(tmp_path / "state"), "1.5"],
        stdout=subprocess.PIPE, text=True,
    )
    try:
        assert proc.stdout.readline().strip() == "held"  # child owns the lock
        t0 = time.monotonic()
        with state_lock(tmp_path / "state"):
            waited = time.monotonic() - t0
        assert waited > 0.5  # we genuinely blocked on the child
    finally:
        proc.wait(timeout=10)


@pytest.mark.skipif(os.name == "nt", reason="fcntl branch is POSIX-only")
def test_posix_branch_imports():
    import fcntl  # noqa: F401  — the module chose the flock path on this platform
    from beadz_camera import lock
    assert lock.fcntl is fcntl
