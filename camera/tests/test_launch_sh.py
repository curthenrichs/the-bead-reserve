import os
import shutil
import subprocess
from pathlib import Path

import pytest

LAUNCH = (Path(__file__).resolve().parents[1] / "launch.sh").as_posix()


def _working_bash():
    """A bash that can actually source launch.sh (git bash / a real POSIX bash),
    not WSL's bash.exe stub which can't read a C:\\ path."""
    candidates = []
    for c in (r"C:\Program Files\Git\bin\bash.exe",
              r"C:\Program Files\Git\usr\bin\bash.exe"):
        if os.path.exists(c):
            candidates.append(c)
    w = shutil.which("bash")
    if w:
        candidates.append(w)
    probe = f'source "{LAUNCH}"; type set_env_key >/dev/null 2>&1'
    for b in candidates:
        try:
            r = subprocess.run([b, "-c", probe], capture_output=True, timeout=15)
        except (OSError, subprocess.TimeoutExpired):
            continue
        if r.returncode == 0:
            return b
    return None


BASH = _working_bash()


@pytest.mark.skipif(BASH is None, reason="no bash that can source launch.sh")
def test_set_env_key_replaces_and_appends_idempotently(tmp_path):
    env = tmp_path / "device.env"
    env.write_text("INGEST_URL=old\nHMAC_SECRET=x\n")
    envp = env.as_posix()
    script = (
        'set -euo pipefail\n'
        f'source "{LAUNCH}"\n'
        f'set_env_key INGEST_URL new "{envp}"\n'
        f'set_env_key CAPTURE_RESOLUTION 1280x720 "{envp}"\n'
        f'set_env_key INGEST_URL newer "{envp}"\n'
    )
    subprocess.run([BASH, "-c", script], check=True, capture_output=True)
    text = env.read_text()
    assert "INGEST_URL=newer" in text
    assert text.count("INGEST_URL=") == 1        # replaced in place, not duplicated
    assert "CAPTURE_RESOLUTION=1280x720" in text  # appended
    assert "HMAC_SECRET=x" in text                # untouched

    tricky = "http://h/p?a=1&b=2|z"
    script2 = 'set -euo pipefail\n' + f'source "{LAUNCH}"\n' + f'set_env_key INGEST_URL "{tricky}" "{envp}"\n'
    subprocess.run([BASH, "-c", script2], check=True, capture_output=True)
    lines = [l for l in env.read_text().splitlines() if l.startswith("INGEST_URL=")]
    assert lines == [f"INGEST_URL={tricky}"]   # exact literal, single line, no corruption
