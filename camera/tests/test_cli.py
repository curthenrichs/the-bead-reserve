import json
from contextlib import contextmanager
from unittest.mock import patch

import pytest
import responses
from PIL import Image

from beadz_camera import cli
from beadz_camera.lock import state_lock as real_state_lock
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


def test_config_error_exits_2_without_traceback(tmp_path, make_device_env, capsys, monkeypatch):
    # earlier load_dotenv(override=True) calls leave HMAC_SECRET in os.environ;
    # clear it so the omitted key is genuinely missing
    monkeypatch.delenv("HMAC_SECRET", raising=False)
    env = make_device_env(omit=("HMAC_SECRET",))
    assert cli.main(["--env", str(env), "capture-once"]) == 2
    err = capsys.readouterr().err
    assert "config error" in err
    assert "Traceback" not in err


def test_keygen_rerun_reexports_pubkey_exit_0(env_file, tmp_path, capsys):
    assert cli.main(["--env", str(env_file), "keygen"]) == 0
    pub = (tmp_path / "state/keys/ed25519.pub").read_text().strip()
    (tmp_path / "state/keys/ed25519.pub").unlink()   # crash left key but no .pub
    assert cli.main(["--env", str(env_file), "keygen"]) == 0   # idempotent recovery
    assert (tmp_path / "state/keys/ed25519.pub").read_text().strip() == pub
    assert pub in capsys.readouterr().out
    assert "Traceback" not in capsys.readouterr().err


def test_seed_rerun_exits_3_and_force_reseeds(env_file, tmp_path, capsys):
    assert cli.main(["--env", str(env_file), "seed-counter"]) == 0
    assert cli.main(["--env", str(env_file), "seed-counter"]) == 3
    (tmp_path / "state" / "counter").write_text("garbage")
    assert cli.main(["--env", str(env_file), "seed-counter", "--value", "41", "--force"]) == 0
    assert (tmp_path / "state" / "counter").read_text().strip() == "41"


def test_corrupt_key_exits_1_with_status(env_file, tmp_path, fake_capture):
    _bootstrap(env_file)
    (tmp_path / "state" / "keys" / "ed25519.key").write_text("not hex at all")
    assert cli.main(["--env", str(env_file), "capture-once"]) == 1
    status = json.loads((tmp_path / "state" / "status.json").read_text())
    assert status["last_capture_ok"] is False


def test_push_drain_oserror_exits_1_with_status(env_file, tmp_path, fake_capture, monkeypatch):
    _bootstrap(env_file)
    cli.main(["--env", str(env_file), "capture-once"])
    monkeypatch.setattr(cli, "drain",
                        lambda cfg, state: (_ for _ in ()).throw(OSError("disk full")))
    assert cli.main(["--env", str(env_file), "push-drain"]) == 1
    status = json.loads((tmp_path / "state" / "status.json").read_text())
    assert status["last_push_ok"] is False
    assert "disk full" in status["last_error"]


def test_push_drain_corrupt_queue_json_exits_1_with_status(env_file, tmp_path, fake_capture):
    _bootstrap(env_file)
    cli.main(["--env", str(env_file), "capture-once"])
    # corrupt the committed frame's metadata (disk corruption / manual edit)
    (tmp_path / "state" / "queue" / "1.json").write_text("garbage{")
    assert cli.main(["--env", str(env_file), "push-drain"]) == 1
    status = json.loads((tmp_path / "state" / "status.json").read_text())
    assert status["last_push_ok"] is False
    assert "last_error" in status


def test_idle_push_drain_does_not_rewrite_status(env_file, tmp_path, monkeypatch):
    assert cli.main(["--env", str(env_file), "seed-counter"]) == 0
    assert cli.main(["--env", str(env_file), "push-drain"]) == 0      # first: writes
    import beadz_camera.status as st
    calls = []
    real = st.atomic_write_text
    monkeypatch.setattr(st, "atomic_write_text",
                        lambda p, t: (calls.append(1), real(p, t))[1])
    assert cli.main(["--env", str(env_file), "push-drain"]) == 0      # idle repeat
    assert calls == []                                               # no status rewrite


@responses.activate
def test_mutations_happen_under_lock(env_file, fake_capture, monkeypatch):
    events = []

    @contextmanager
    def spy(state_dir):
        events.append("enter")
        with real_state_lock(state_dir):
            yield
        events.append("exit")

    monkeypatch.setattr(cli, "state_lock", spy)
    _bootstrap(env_file)                       # seed-counter: one enter/exit
    cli.main(["--env", str(env_file), "capture-once"])
    responses.add(responses.POST, INGEST, status=200, json={})
    cli.main(["--env", str(env_file), "push-drain"])
    # seed + capture + drain = three balanced acquisitions, none nested
    assert events == ["enter", "exit"] * 3
