import base64
import json

import pytest
import requests
import responses

from beadz_camera.config import Config
from beadz_camera.push import PushError, drain, hmac_hex
from beadz_camera.queue import StateDir

INGEST = "https://api.test/ingest"


@pytest.fixture()
def cfg(tmp_path):
    return Config(
        ingest_url=INGEST,
        hmac_secret="topsecret",
        camera_device="/dev/video0",
        crop_rect=(0, 0, 640, 480),
        state_dir=tmp_path / "state",
        key_path=tmp_path / "state/keys/ed25519.key",
        drain_batch_max=2,
    )


@pytest.fixture()
def state(cfg, enqueue_frame):
    s = StateDir(cfg.state_dir)
    s.seed_counter(0)
    for c in (1, 2, 3):
        enqueue_frame(s, c)
    return s


@responses.activate
def test_drain_pushes_in_order_with_hmac_and_body(cfg, state):
    seen = []

    def check(request):
        body = json.loads(request.body)
        seen.append(body["counter"])
        assert request.headers["X-Beadz-Mac"] == hmac_hex("topsecret", request.body)
        assert base64.b64decode(body["image_b64"]) == b"jpeg-%d" % body["counter"]
        assert body["croText"] is None
        return (200, {}, "{}")

    responses.add_callback(responses.POST, INGEST, callback=check)
    report = drain(cfg, state)
    assert seen == [1, 2]                    # oldest first, batch cap of 2 honored
    assert report == {"pushed": 2, "counter_seen": 0, "failed": False, "remaining": 1}
    assert [f.counter for f in state.pending()] == [3]


@responses.activate
def test_counter_seen_treated_as_ack(cfg, state):
    responses.add(responses.POST, INGEST, status=409)
    report = drain(cfg, state)
    assert report["counter_seen"] == 2       # batch cap still applies
    assert [f.counter for f in state.pending()] == [3]


@responses.activate
def test_server_error_stops_drain(cfg, state):
    responses.add(responses.POST, INGEST, status=200, json={})
    responses.add(responses.POST, INGEST, status=500)
    report = drain(cfg, state)
    assert report == {"pushed": 1, "counter_seen": 0, "failed": True, "remaining": 2}
    assert [f.counter for f in state.pending()] == [2, 3]  # order preserved


@responses.activate
def test_network_exception_stops_drain(cfg, state):
    # NB: requests' ConnectionError, not the builtin (which is an OSError and
    # would not exercise the RequestException handler)
    responses.add(
        responses.POST, INGEST,
        body=requests.exceptions.ConnectionError("no route"),
    )
    report = drain(cfg, state)
    assert report["failed"] is True
    assert report["pushed"] == 0
    assert len(state.pending()) == 3


@responses.activate
def test_drain_scans_queue_once(cfg, state, monkeypatch):
    responses.add(responses.POST, INGEST, status=200, json={})
    calls = []
    real_pending = type(state).pending

    def spy(self):
        calls.append(1)
        return real_pending(self)

    monkeypatch.setattr(type(state), "pending", spy)
    drain(cfg, state)
    assert len(calls) == 1


def test_frame_file_error_raises_push_error(cfg, state, monkeypatch):
    # snapshot FIRST, then delete the jpg — simulates local loss mid-drain
    # (a fresh pending() would just skip the frame, so pin the snapshot)
    snapshot = state.pending()
    snapshot[0].jpg.unlink()
    monkeypatch.setattr(type(state), "pending", lambda self: snapshot)
    with pytest.raises(PushError, match="frame 1"):
        drain(cfg, state)  # read_bytes -> FileNotFoundError -> PushError; no HTTP happens


@responses.activate
def test_archive_oserror_becomes_push_error(cfg, state, monkeypatch):
    responses.add(responses.POST, INGEST, status=200, json={})
    def _boom(frame):
        raise OSError("disk full")
    monkeypatch.setattr(state, "archive", _boom)   # push succeeds, archive fails
    with pytest.raises(PushError, match="frame 1"):
        drain(cfg, state)


def test_push_sends_version_headers(cfg, state):
    seen = {}

    @responses.activate
    def run():
        def check(request):
            seen["client"] = request.headers.get("X-Beadz-Client")
            seen["protocol"] = request.headers.get("X-Beadz-Protocol")
            return (200, {}, "{}")
        responses.add_callback(responses.POST, INGEST, callback=check)
        drain(cfg, state)

    run()
    assert seen["protocol"] == "1"
    assert seen["client"] == "beadz-camera/0.1.0"
