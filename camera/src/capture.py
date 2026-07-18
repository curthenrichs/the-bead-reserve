"""USB webcam capture via fswebcam (V4L2). Raw frames go to caller-chosen
temp paths (tmpfs on the Pi) — never into the state dir."""

from __future__ import annotations

import subprocess
from pathlib import Path


class CaptureError(RuntimeError):
    pass


def capture_frame(device: str, dest: Path, timeout: int = 30) -> None:
    cmd = ["fswebcam", "-d", device, "--no-banner", str(dest)]
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        raise CaptureError(f"capture timed out after {timeout}s") from exc
    except FileNotFoundError as exc:
        raise CaptureError("fswebcam not installed") from exc
    if result.returncode != 0:
        raise CaptureError(
            f"fswebcam exit code {result.returncode}: "
            f"{(result.stderr or b'').decode(errors='replace').strip()}"
        )
    if not dest.exists():
        raise CaptureError("fswebcam produced no output file")
