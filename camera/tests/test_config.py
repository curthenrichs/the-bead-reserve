from pathlib import Path

import pytest

from beadz_camera.config import Config


def _write_env(tmp_path: Path, **overrides) -> Path:
    values = {
        "INGEST_URL": "https://api.test/ingest",
        "HMAC_SECRET": "topsecret",
        "CAMERA_DEVICE": "/dev/video0",
        "CROP_RECT": "10,20,640,480",
        "STATE_DIR": str(tmp_path / "state"),
        "ED25519_KEY_PATH": str(tmp_path / "state/keys/ed25519.key"),
        "DRAIN_BATCH_MAX": "20",
    }
    values.update(overrides)
    env_file = tmp_path / "device.env"
    env_file.write_text("".join(f"{k}={v}\n" for k, v in values.items()))
    return env_file


def test_loads_all_fields(tmp_path, monkeypatch):
    for k in ("INGEST_URL", "HMAC_SECRET", "CROP_RECT", "DRAIN_BATCH_MAX"):
        monkeypatch.delenv(k, raising=False)
    cfg = Config.from_env(_write_env(tmp_path))
    assert cfg.ingest_url == "https://api.test/ingest"
    assert cfg.hmac_secret == "topsecret"
    assert cfg.crop_rect == (10, 20, 640, 480)
    assert cfg.state_dir == Path(str(tmp_path / "state"))
    assert cfg.drain_batch_max == 20


def test_drain_batch_max_defaults_to_20(tmp_path, monkeypatch):
    monkeypatch.delenv("DRAIN_BATCH_MAX", raising=False)
    env = _write_env(tmp_path)
    lines = [l for l in env.read_text().splitlines() if not l.startswith("DRAIN_BATCH_MAX")]
    env.write_text("\n".join(lines) + "\n")
    assert Config.from_env(env).drain_batch_max == 20


def test_bad_crop_rect_raises(tmp_path, monkeypatch):
    monkeypatch.delenv("CROP_RECT", raising=False)
    with pytest.raises(ValueError, match="CROP_RECT"):
        Config.from_env(_write_env(tmp_path, CROP_RECT="10,20,640"))


def test_missing_required_key_raises(tmp_path, monkeypatch):
    monkeypatch.delenv("HMAC_SECRET", raising=False)
    env = _write_env(tmp_path)
    lines = [l for l in env.read_text().splitlines() if not l.startswith("HMAC_SECRET")]
    env.write_text("\n".join(lines) + "\n")
    with pytest.raises(ValueError, match="HMAC_SECRET"):
        Config.from_env(env)
