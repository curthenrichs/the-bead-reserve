import subprocess
from unittest.mock import patch

import pytest

from beadz_camera.capture import CaptureError, capture_frame


def test_builds_fswebcam_command(tmp_path):
    dest = tmp_path / "frame.jpg"

    def fake_run(cmd, **kwargs):
        assert cmd[0] == "fswebcam"
        assert "--no-banner" in cmd
        assert "-d" in cmd and cmd[cmd.index("-d") + 1] == "/dev/video0"
        assert cmd[-1] == str(dest)
        dest.write_bytes(b"jpeg")
        return subprocess.CompletedProcess(cmd, 0)

    with patch("beadz_camera.capture.subprocess.run", side_effect=fake_run):
        capture_frame("/dev/video0", dest)
    assert dest.read_bytes() == b"jpeg"


def test_nonzero_exit_raises(tmp_path):
    with patch(
        "beadz_camera.capture.subprocess.run",
        return_value=subprocess.CompletedProcess(["fswebcam"], 1),
    ):
        with pytest.raises(CaptureError, match="exit code 1"):
            capture_frame("/dev/video0", tmp_path / "frame.jpg")


def test_timeout_raises(tmp_path):
    with patch(
        "beadz_camera.capture.subprocess.run",
        side_effect=subprocess.TimeoutExpired(cmd="fswebcam", timeout=30),
    ):
        with pytest.raises(CaptureError, match="timed out"):
            capture_frame("/dev/video0", tmp_path / "frame.jpg")


def test_missing_output_raises(tmp_path):
    with patch(
        "beadz_camera.capture.subprocess.run",
        return_value=subprocess.CompletedProcess(["fswebcam"], 0),
    ):
        with pytest.raises(CaptureError, match="no output"):
            capture_frame("/dev/video0", tmp_path / "frame.jpg")


def test_resolution_adds_r_flag(tmp_path):
    dest = tmp_path / "frame.jpg"
    def fake_run(cmd, **kwargs):
        assert "-r" in cmd and cmd[cmd.index("-r") + 1] == "1280x720"
        assert cmd[-1] == str(dest)          # dest stays last (fswebcam positional)
        dest.write_bytes(b"jpeg")
        return subprocess.CompletedProcess(cmd, 0)
    with patch("beadz_camera.capture.subprocess.run", side_effect=fake_run):
        capture_frame("/dev/video0", dest, resolution=(1280, 720))


def test_no_resolution_omits_r_flag(tmp_path):
    dest = tmp_path / "frame.jpg"
    def fake_run(cmd, **kwargs):
        assert "-r" not in cmd
        dest.write_bytes(b"jpeg")
        return subprocess.CompletedProcess(cmd, 0)
    with patch("beadz_camera.capture.subprocess.run", side_effect=fake_run):
        capture_frame("/dev/video0", dest)
