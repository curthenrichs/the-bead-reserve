import shutil
import subprocess

import pytest

LAUNCH = str(__import__("pathlib").Path(__file__).resolve().parents[1] / "launch.sh")


@pytest.mark.skipif(shutil.which("bash") is None, reason="needs bash")
def test_set_env_key_replaces_and_appends_idempotently(tmp_path):
    env = tmp_path / "device.env"
    env.write_text("INGEST_URL=old\nHMAC_SECRET=x\n")
    script = (
        f'set -euo pipefail\n'
        f'source "{LAUNCH}"\n'
        f'set_env_key INGEST_URL new "{env}"\n'
        f'set_env_key CAPTURE_RESOLUTION 1280x720 "{env}"\n'
        f'set_env_key INGEST_URL newer "{env}"\n'
    )
    subprocess.run(["bash", "-c", script], check=True)
    text = env.read_text()
    assert "INGEST_URL=newer" in text
    assert text.count("INGEST_URL=") == 1        # replaced in place, not duplicated
    assert "CAPTURE_RESOLUTION=1280x720" in text  # appended
    assert "HMAC_SECRET=x" in text                # untouched
