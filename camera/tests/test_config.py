from pathlib import Path

import pytest

from beadz_camera.config import Config, ConfigError


def test_loads_all_fields(tmp_path, monkeypatch, make_device_env):
    for k in ("INGEST_URL", "HMAC_SECRET", "CROP_RECT", "DRAIN_BATCH_MAX"):
        monkeypatch.delenv(k, raising=False)
    cfg = Config.from_env(make_device_env())
    assert cfg.ingest_url == "https://api.test/ingest"
    assert cfg.hmac_secret == "topsecret"
    assert cfg.crop_rect == (10, 20, 300, 200)
    assert cfg.state_dir == Path(str(tmp_path / "state"))
    assert cfg.drain_batch_max == 20


def test_drain_batch_max_defaults_to_20(monkeypatch, make_device_env):
    monkeypatch.delenv("DRAIN_BATCH_MAX", raising=False)
    env = make_device_env(omit=("DRAIN_BATCH_MAX",))
    assert Config.from_env(env).drain_batch_max == 20


def test_bad_crop_rect_raises(monkeypatch, make_device_env):
    monkeypatch.delenv("CROP_RECT", raising=False)
    with pytest.raises(ValueError, match="CROP_RECT"):
        Config.from_env(make_device_env(CROP_RECT="10,20,640"))


def test_missing_required_key_raises(monkeypatch, make_device_env):
    monkeypatch.delenv("HMAC_SECRET", raising=False)
    env = make_device_env(omit=("HMAC_SECRET",))
    with pytest.raises(ValueError, match="HMAC_SECRET"):
        Config.from_env(env)


def test_errors_are_config_error(monkeypatch, make_device_env):
    monkeypatch.delenv("CROP_RECT", raising=False)
    with pytest.raises(ConfigError):
        Config.from_env(make_device_env(CROP_RECT="1,2,3"))


def test_wrong_count_and_non_integer_same_error(monkeypatch, make_device_env):
    monkeypatch.delenv("CROP_RECT", raising=False)
    with pytest.raises(ConfigError, match="four integers"):
        Config.from_env(make_device_env(CROP_RECT="1,2,3,x"))
