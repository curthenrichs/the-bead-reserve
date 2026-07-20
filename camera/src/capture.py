"""USB webcam capture via fswebcam (V4L2). Raw frames go to caller-chosen
temp paths (tmpfs on the Pi) — never into the state dir."""

from __future__ import annotations

import subprocess
from pathlib import Path


class CaptureError(RuntimeError):
    pass


def capture_frame(device: str, dest: Path, timeout: int = 30,
                  resolution: tuple[int, int] | None = None,
                  controls: tuple[tuple[str, str], ...] | None = None,
                  skip: int = 0) -> None:
    if controls:
        ctl = ["v4l2-ctl", "-d", device]
        for name, value in controls:
            ctl += ["--set-ctrl", f"{name}={value}"]
        try:
            r = subprocess.run(ctl, capture_output=True, timeout=timeout)
        except subprocess.TimeoutExpired as exc:
            raise CaptureError(f"v4l2-ctl timed out after {timeout}s") from exc
        except FileNotFoundError as exc:
            raise CaptureError("v4l2-ctl not installed (apt install v4l-utils)") from exc
        if r.returncode != 0:
            raise CaptureError(
                "v4l2-ctl failed applying CAMERA_CONTROLS: "
                f"{(r.stderr or b'').decode(errors='replace').strip()}"
            )
    cmd = ["fswebcam", "-d", device, "--no-banner"]
    if skip > 0:
        cmd += ["-S", str(skip)]
    if resolution is not None:
        cmd += ["-r", f"{resolution[0]}x{resolution[1]}"]
    cmd.append(str(dest))
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
