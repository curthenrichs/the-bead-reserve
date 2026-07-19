import json
from unittest.mock import patch

import pytest
import responses
from PIL import Image

from beadz_camera import cli
from beadz_camera.queue import StateDir
from beadz_camera.sign import sha256_file, verify

INGEST = "https://api.test/ingest"


@pytest.fixture()
def env_file(make_device_env):
    return make_device_env(CROP_RECT="100,50,200,150")


@pytest.fixture()
def fake_capture(make_exif_jpeg):
    """Replace fswebcam with a synthetic 640x480 frame carrying EXIF."""
    def _fake(device, dest, timeout=30):
        make_exif_jpeg(dest)
    with patch("beadz_camera.cli.capture_frame", side_effect=_fake):
        yield


def _bootstrap(env_file):
    assert cli.main(["--env", str(env_file), "keygen"]) == 0
    assert cli.main(["--env", str(env_file), "seed-counter"]) == 0


def test_capture_once_enqueues_signed_frame(env_file, tmp_path, fake_capture):
    _bootstrap(env_file)
    assert cli.main(["--env", str(env_file), "capture-once"]) == 0

    state = StateDir(tmp_path / "state")
    frames = state.pending()
    assert len(frames) == 1
    frame = frames[0]
    assert frame.counter == 1
    assert Image.open(frame.jpg).size == (200, 150)          # cropped
    assert len(Image.open(frame.jpg).getexif()) == 0          # EXIF-free
    assert frame.meta["sha256"] == sha256_file(frame.jpg)     # hash of final bytes
    assert frame.meta["croText"] is None
    pub = (tmp_path / "state/keys/ed25519.pub").read_text().strip()
    assert verify(pub, frame.meta["sha256"], frame.meta["sig"])

    status = json.loads((tmp_path / "state/status.json").read_text())
    assert status["last_capture_ok"] is True
    assert status["queue_depth"] == 1


def test_capture_failure_exits_nonzero_and_records(env_file, tmp_path):
    _bootstrap(env_file)
    from beadz_camera.capture import CaptureError
    with patch("beadz_camera.cli.capture_frame", side_effect=CaptureError("USB gone")):
        assert cli.main(["--env", str(env_file), "capture-once"]) == 1
    status = json.loads((tmp_path / "state/status.json").read_text())
    assert status["last_capture_ok"] is False
    assert "USB gone" in status["last_error"]


def test_capture_without_seeded_counter_is_fatal(env_file, fake_capture):
    assert cli.main(["--env", str(env_file), "keygen"]) == 0
    assert cli.main(["--env", str(env_file), "capture-once"]) == 1


@responses.activate
def test_end_to_end_capture_then_drain(env_file, tmp_path, fake_capture):
    _bootstrap(env_file)
    cli.main(["--env", str(env_file), "capture-once"])
    cli.main(["--env", str(env_file), "capture-once"])
    responses.add(responses.POST, INGEST, status=200, json={})

    assert cli.main(["--env", str(env_file), "push-drain"]) == 0

    state = StateDir(tmp_path / "state")
    assert state.pending() == []
    assert (tmp_path / "state/archive/1.jpg").exists()
    assert (tmp_path / "state/archive/2.json").exists()
    status = json.loads((tmp_path / "state/status.json").read_text())
    assert status["queue_depth"] == 0
    assert status["last_push_ok"] is True


@responses.activate
def test_drain_failure_exits_nonzero(env_file, tmp_path, fake_capture):
    _bootstrap(env_file)
    cli.main(["--env", str(env_file), "capture-once"])
    responses.add(responses.POST, INGEST, status=500)
    assert cli.main(["--env", str(env_file), "push-drain"]) == 1
    status = json.loads((tmp_path / "state/status.json").read_text())
    assert status["last_push_ok"] is False
    assert status["queue_depth"] == 1
