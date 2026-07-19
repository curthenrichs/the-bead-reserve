"""Shared fixtures. One source of truth for the device.env shape, the
synthetic EXIF-bearing frame, and the queued-frame metadata schema."""

from pathlib import Path

import pytest
from PIL import Image


@pytest.fixture()
def make_device_env(tmp_path):
    """Factory: build a device.env; override keys via kwargs, drop via omit=()."""

    def _make(omit=(), **overrides):
        state = tmp_path / "state"
        values = {
            "INGEST_URL": "https://api.test/ingest",
            "HMAC_SECRET": "topsecret",
            "CAMERA_DEVICE": "/dev/video0",
            "CROP_RECT": "10,20,300,200",
            "STATE_DIR": str(state),
            "ED25519_KEY_PATH": str(state / "keys/ed25519.key"),
            "DRAIN_BATCH_MAX": "20",
        }
        values.update(overrides)
        for key in omit:
            values.pop(key, None)
        env = tmp_path / "device.env"
        env.write_text("".join(f"{k}={v}\n" for k, v in values.items()))
        return env

    return _make


@pytest.fixture()
def make_exif_jpeg():
    """Factory: write a synthetic raw frame carrying EXIF metadata."""

    def _make(path: Path, size=(640, 480)):
        img = Image.new("RGB", size, "orange")
        exif = Image.Exif()
        exif[271] = "FaultCam"          # Make
        exif[272] = "TestBench 3000"    # Model
        img.save(path, format="JPEG", exif=exif)
        assert len(Image.open(path).getexif()) > 0  # fixture sanity
        return path

    return _make


@pytest.fixture()
def frame_meta():
    """Canonical queued-frame metadata shape (the on-disk JSON contract)."""

    def _meta(counter: int) -> dict:
        return {"counter": counter, "ts": 1750000000 + counter,
                "sha256": "ab" * 32, "sig": "cd" * 64, "croText": None}

    return _meta


@pytest.fixture()
def enqueue_frame(frame_meta, tmp_path):
    """Factory: enqueue a synthetic frame with canonical metadata."""

    def _enqueue(state, counter: int):
        src = tmp_path / f"tmp-{counter}.jpg"
        src.write_bytes(b"jpeg-%d" % counter)
        state.enqueue(counter, src, frame_meta(counter))

    return _enqueue
