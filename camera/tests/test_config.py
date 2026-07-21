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


@pytest.mark.parametrize("bad", ["0", "-1"])
def test_non_positive_drain_batch_max_raises(bad, make_device_env, monkeypatch):
    monkeypatch.delenv("DRAIN_BATCH_MAX", raising=False)
    with pytest.raises(ConfigError, match="DRAIN_BATCH_MAX"):
        Config.from_env(make_device_env(DRAIN_BATCH_MAX=bad))


def test_capture_resolution_unset_is_none(make_device_env, monkeypatch):
    monkeypatch.delenv("CAPTURE_RESOLUTION", raising=False)
    assert Config.from_env(make_device_env()).capture_resolution is None


def test_capture_resolution_parsed(make_device_env, monkeypatch):
    monkeypatch.delenv("CAPTURE_RESOLUTION", raising=False)
    cfg = Config.from_env(make_device_env(CAPTURE_RESOLUTION="1280x720"))
    assert cfg.capture_resolution == (1280, 720)


@pytest.mark.parametrize("bad", ["1280", "1280x", "axb", "0x0", "1280x720x1"])
def test_capture_resolution_malformed_raises(bad, make_device_env, monkeypatch):
    monkeypatch.delenv("CAPTURE_RESOLUTION", raising=False)
    with pytest.raises(ConfigError, match="CAPTURE_RESOLUTION"):
        Config.from_env(make_device_env(CAPTURE_RESOLUTION=bad))


def test_camera_controls_unset_is_none(make_device_env, monkeypatch):
    monkeypatch.delenv("CAMERA_CONTROLS", raising=False)
    assert Config.from_env(make_device_env()).camera_controls is None


def test_camera_controls_parsed(make_device_env, monkeypatch):
    monkeypatch.delenv("CAMERA_CONTROLS", raising=False)
    cfg = Config.from_env(make_device_env(
        CAMERA_CONTROLS="white_balance_automatic=0,white_balance_temperature=5000"))
    assert cfg.camera_controls == (
        ("white_balance_automatic", "0"), ("white_balance_temperature", "5000"))


def test_camera_controls_value_may_contain_equals(make_device_env, monkeypatch):
    monkeypatch.delenv("CAMERA_CONTROLS", raising=False)
    cfg = Config.from_env(make_device_env(CAMERA_CONTROLS="a=b=c"))
    assert cfg.camera_controls == (("a", "b=c"),)   # split on first '=' only


@pytest.mark.parametrize("bad", ["foo", "=1", "a=", "a=1,bad"])
def test_camera_controls_malformed_raises(bad, make_device_env, monkeypatch):
    monkeypatch.delenv("CAMERA_CONTROLS", raising=False)
    with pytest.raises(ConfigError, match="CAMERA_CONTROLS"):
        Config.from_env(make_device_env(CAMERA_CONTROLS=bad))


def test_capture_skip_unset_is_zero(make_device_env, monkeypatch):
    monkeypatch.delenv("CAPTURE_SKIP", raising=False)
    assert Config.from_env(make_device_env()).capture_skip == 0


def test_capture_skip_parsed(make_device_env, monkeypatch):
    monkeypatch.delenv("CAPTURE_SKIP", raising=False)
    assert Config.from_env(make_device_env(CAPTURE_SKIP="20")).capture_skip == 20


@pytest.mark.parametrize("bad", ["-1", "x", "1.5"])
def test_capture_skip_malformed_raises(bad, make_device_env, monkeypatch):
    monkeypatch.delenv("CAPTURE_SKIP", raising=False)
    with pytest.raises(ConfigError, match="CAPTURE_SKIP"):
        Config.from_env(make_device_env(CAPTURE_SKIP=bad))


def test_cro_defaults_to_null(make_device_env, monkeypatch):
    for k in ("CRO_IMPL", "CRO_SERVER_BIN", "CRO_MODEL_PATH", "CRO_MMPROJ_PATH",
              "CRO_CTX_SIZE", "CRO_BEST_OF", "CRO_MOOD_HOLD_HOURS", "CRO_TIMEOUT_S"):
        monkeypatch.delenv(k, raising=False)
    cfg = Config.from_env(make_device_env())
    assert cfg.cro_impl == "null"
    assert cfg.cro_model_path is None
    assert cfg.cro_ctx_size == 2048 and cfg.cro_best_of == 3
    assert cfg.cro_mood_hold_hours == 3 and cfg.cro_timeout_s == 180


def test_cro_smolvlm_requires_paths(make_device_env, monkeypatch):
    for k in ("CRO_IMPL", "CRO_SERVER_BIN", "CRO_MODEL_PATH", "CRO_MMPROJ_PATH",
              "CRO_CTX_SIZE", "CRO_BEST_OF", "CRO_MOOD_HOLD_HOURS", "CRO_TIMEOUT_S"):
        monkeypatch.delenv(k, raising=False)
    with pytest.raises(ConfigError, match="CRO_SERVER_BIN"):
        Config.from_env(make_device_env(CRO_IMPL="smolvlm"))


def test_cro_smolvlm_full(make_device_env, monkeypatch):
    for k in ("CRO_IMPL", "CRO_SERVER_BIN", "CRO_MODEL_PATH", "CRO_MMPROJ_PATH",
              "CRO_CTX_SIZE", "CRO_BEST_OF", "CRO_MOOD_HOLD_HOURS", "CRO_TIMEOUT_S"):
        monkeypatch.delenv(k, raising=False)
    cfg = Config.from_env(make_device_env(
        CRO_IMPL="smolvlm", CRO_SERVER_BIN="/opt/llama-server",
        CRO_MODEL_PATH="/opt/m.gguf", CRO_MMPROJ_PATH="/opt/mm.gguf",
        CRO_CTX_SIZE="1536", CRO_BEST_OF="2", CRO_MOOD_HOLD_HOURS="4",
        CRO_TIMEOUT_S="120"))
    assert cfg.cro_impl == "smolvlm"
    assert cfg.cro_server_bin.as_posix() == "/opt/llama-server"
    assert cfg.cro_ctx_size == 1536 and cfg.cro_best_of == 2


def test_cro_unknown_impl(make_device_env, monkeypatch):
    for k in ("CRO_IMPL", "CRO_SERVER_BIN", "CRO_MODEL_PATH", "CRO_MMPROJ_PATH",
              "CRO_CTX_SIZE", "CRO_BEST_OF", "CRO_MOOD_HOLD_HOURS", "CRO_TIMEOUT_S"):
        monkeypatch.delenv(k, raising=False)
    with pytest.raises(ConfigError, match="CRO_IMPL"):
        Config.from_env(make_device_env(CRO_IMPL="gpt5"))


def test_cro_bad_numeric(make_device_env, monkeypatch):
    for k in ("CRO_IMPL", "CRO_SERVER_BIN", "CRO_MODEL_PATH", "CRO_MMPROJ_PATH",
              "CRO_CTX_SIZE", "CRO_BEST_OF", "CRO_MOOD_HOLD_HOURS", "CRO_TIMEOUT_S"):
        monkeypatch.delenv(k, raising=False)
    with pytest.raises(ConfigError, match="CRO_BEST_OF"):
        Config.from_env(make_device_env(
            CRO_IMPL="smolvlm", CRO_SERVER_BIN="/o/s",
            CRO_MODEL_PATH="/o/m", CRO_MMPROJ_PATH="/o/mm", CRO_BEST_OF="0"))
