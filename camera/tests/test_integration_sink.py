"""End-to-end over real HTTP: the actual CLI pushing to the actual sink.

First coverage of HMAC-over-wire-bytes and the socket path — everything
before this file used in-process `responses` mocks."""

import base64
import hashlib
import json

import pytest
import requests

from beadz_camera import cli
from beadz_camera.push import hmac_hex
from beadz_camera.sign import verify
from beadz_camera.sink import IngestSink

SECRET = "topsecret"  # matches make_device_env's default HMAC_SECRET


@pytest.fixture()
def rig(tmp_path, make_device_env, make_exif_jpeg, monkeypatch):
    """keygen -> sink on an ephemeral port -> device.env aimed at it -> fake camera."""
    env = make_device_env()  # INGEST_URL not used by keygen/seed
    assert cli.main(["--env", str(env), "keygen"]) == 0
    pub = (tmp_path / "state/keys/ed25519.pub").read_text().strip()
    sink = IngestSink(SECRET, pub, tmp_path / "sink", port=0)
    sink.start()
    env = make_device_env(INGEST_URL=sink.url)
    assert cli.main(["--env", str(env), "seed-counter"]) == 0

    def _fake(device, dest, timeout=30, resolution=None, controls=None, skip=0):
        make_exif_jpeg(dest)

    monkeypatch.setattr(cli, "capture_frame", _fake)
    yield {"env": env, "sink": sink, "tmp": tmp_path, "pub": pub}
    sink.stop()


def _replay_body(tmp, counter):
    meta = json.loads((tmp / f"sink/frames/{counter}.json").read_text())
    jpg = (tmp / f"sink/frames/{counter}.jpg").read_bytes()
    return json.dumps({**meta, "image_b64": base64.b64encode(jpg).decode()}).encode()


def test_capture_drain_verify_end_to_end(rig):
    env, sink, tmp = rig["env"], rig["sink"], rig["tmp"]
    for _ in range(3):
        assert cli.main(["--env", str(env), "capture-once"]) == 0
    assert cli.main(["--env", str(env), "push-drain"]) == 0

    assert [e["counter"] for e in sink.events] == [1, 2, 3]
    assert all(e["outcome"] == "accept" for e in sink.events)
    # the "what a stranger would do" check, automated: re-hash the stored
    # bytes, verify the sig against the published pubkey
    for c in (1, 2, 3):
        jpg = (tmp / f"sink/frames/{c}.jpg").read_bytes()
        meta = json.loads((tmp / f"sink/frames/{c}.json").read_text())
        assert hashlib.sha256(jpg).hexdigest() == meta["sha256"]
        assert verify(rig["pub"], meta["sha256"], meta["sig"])
    # device side fully archived, status honest
    assert (tmp / "state/archive/3.jpg").exists()
    status = json.loads((tmp / "state/status.json").read_text())
    assert status["queue_depth"] == 0 and status["last_push_ok"] is True


def test_verbatim_replay_gets_409(rig):
    env, sink, tmp = rig["env"], rig["sink"], rig["tmp"]
    cli.main(["--env", str(env), "capture-once"])
    cli.main(["--env", str(env), "push-drain"])
    body = _replay_body(tmp, 1)
    r = requests.post(sink.url, data=body,
                      headers={"X-Beadz-Mac": hmac_hex(SECRET, body)}, timeout=5)
    assert r.status_code == 409 and r.json()["error"] == "counter_seen"


def test_tampered_image_gets_400(rig):
    env, sink, tmp = rig["env"], rig["sink"], rig["tmp"]
    cli.main(["--env", str(env), "capture-once"])
    cli.main(["--env", str(env), "push-drain"])
    payload = json.loads(_replay_body(tmp, 1))
    payload["counter"] = 2  # dodge the 409 so the signature check is what fires
    img = bytearray(base64.b64decode(payload["image_b64"]))
    img[len(img) // 2] ^= 0xFF
    payload["image_b64"] = base64.b64encode(bytes(img)).decode()
    body = json.dumps(payload).encode()
    r = requests.post(sink.url, data=body,
                      headers={"X-Beadz-Mac": hmac_hex(SECRET, body)}, timeout=5)
    assert r.status_code == 400 and r.json()["error"] == "bad_signature"


def test_wrong_secret_drain_fails_and_frame_stays(rig, make_device_env):
    sink, tmp = rig["sink"], rig["tmp"]
    bad_env = make_device_env(INGEST_URL=sink.url, HMAC_SECRET="wrong-secret")
    assert cli.main(["--env", str(bad_env), "capture-once"]) == 0  # capture doesn't push
    assert cli.main(["--env", str(bad_env), "push-drain"]) == 1    # 401 -> FAIL -> exit 1
    assert sink.events[-1]["status"] == 401
    assert (tmp / "state/queue/1.jpg").exists()                    # frame stayed queued
    status = json.loads((tmp / "state/status.json").read_text())
    assert status["last_push_ok"] is False


def test_sink_restart_still_rejects_replay(rig):
    env, sink, tmp = rig["env"], rig["sink"], rig["tmp"]
    cli.main(["--env", str(env), "capture-once"])
    cli.main(["--env", str(env), "push-drain"])
    sink.stop()
    sink2 = IngestSink(SECRET, rig["pub"], tmp / "sink", port=0)
    sink2.start()
    try:
        body = _replay_body(tmp, 1)
        r = requests.post(sink2.url, data=body,
                          headers={"X-Beadz-Mac": hmac_hex(SECRET, body)}, timeout=5)
        assert r.status_code == 409
    finally:
        sink2.stop()
