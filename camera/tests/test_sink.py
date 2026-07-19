import base64
import hashlib
import json
import time

import pytest
import requests

from beadz_camera.push import hmac_hex
from beadz_camera.sign import generate_keypair, load_signing_key, sign_hash
from beadz_camera.sink import IngestSink

SECRET = "sink-secret"


@pytest.fixture()
def keypair(tmp_path):
    key_path = tmp_path / "keys" / "ed25519.key"
    pub = generate_keypair(key_path)
    return key_path, pub


@pytest.fixture()
def sink(tmp_path, keypair):
    _, pub = keypair
    s = IngestSink(SECRET, pub, tmp_path / "sink", port=0)
    s.start()
    yield s
    s.stop()


def _body(keypair, counter=1, ts=None, image=b"jpegbytes", sha=None, sig=None):
    key_path, _ = keypair
    digest = hashlib.sha256(image).hexdigest() if sha is None else sha
    signature = sign_hash(load_signing_key(key_path), digest) if sig is None else sig
    payload = {"counter": counter, "ts": int(time.time()) if ts is None else ts,
               "sha256": digest, "sig": signature, "croText": None,
               "image_b64": base64.b64encode(image).decode()}
    return json.dumps(payload).encode()


def _post(sink, body, mac=None, path="/api/ingest"):
    return requests.post(
        f"http://127.0.0.1:{sink.port}{path}", data=body,
        headers={"Content-Type": "application/json",
                 "X-Beadz-Mac": hmac_hex(SECRET, body) if mac is None else mac},
        timeout=5)


def test_accept_stores_frame_and_bumps_last_seen(sink, keypair, tmp_path):
    r = _post(sink, _body(keypair, counter=1))
    assert r.status_code == 200
    assert r.json() == {"ok": True, "counter": 1}
    assert (tmp_path / "sink/frames/1.jpg").read_bytes() == b"jpegbytes"
    meta = json.loads((tmp_path / "sink/frames/1.json").read_text())
    assert meta["counter"] == 1 and "image_b64" not in meta
    assert (tmp_path / "sink/last_seen").read_text().strip() == "1"
    assert sink.events[-1]["outcome"] == "accept"


def test_bad_mac_401(sink, keypair):
    r = _post(sink, _body(keypair), mac="0" * 64)
    assert r.status_code == 401 and r.json()["error"] == "bad_mac"
    assert sink.events[-1] == {"outcome": "reject", "status": 401,
                               "counter": None, "reason": "bad_mac"}


def test_not_json_400(sink):
    assert _post(sink, b"not json{").status_code == 400


def test_missing_key_400(sink, keypair):
    payload = json.loads(_body(keypair))
    del payload["sig"]
    raw = json.dumps(payload).encode()
    r = _post(sink, raw)
    assert r.status_code == 400 and r.json()["error"] == "bad_request"


def test_wrong_hash_400_bad_signature(sink, keypair):
    r = _post(sink, _body(keypair, sha="ab" * 32))
    assert r.status_code == 400 and r.json()["error"] == "bad_signature"


def test_malformed_hex_sig_is_400_not_500(sink, keypair):
    r = _post(sink, _body(keypair, sig="zz-not-hex"))
    assert r.status_code == 400 and r.json()["error"] == "bad_signature"


def test_replay_and_stale_counter_409(sink, keypair):
    assert _post(sink, _body(keypair, counter=5)).status_code == 200
    r = _post(sink, _body(keypair, counter=5))
    assert r.status_code == 409 and r.json()["error"] == "counter_seen"
    assert _post(sink, _body(keypair, counter=4)).status_code == 409


def test_counter_gap_is_legal(sink, keypair):
    assert _post(sink, _body(keypair, counter=1)).status_code == 200
    assert _post(sink, _body(keypair, counter=10)).status_code == 200


def test_ts_skew_warns_but_accepts(sink, keypair):
    r = _post(sink, _body(keypair, counter=9, ts=int(time.time()) - 86400))
    assert r.status_code == 200
    event = [e for e in sink.events if e["counter"] == 9][0]
    assert "skew-warn" in event["reason"]


def test_wrong_path_404_and_get_405(sink, keypair):
    body = _body(keypair)
    assert _post(sink, body, path="/other").status_code == 404
    assert requests.get(f"http://127.0.0.1:{sink.port}/api/ingest", timeout=5).status_code == 405


def test_non_string_sig_is_400_not_500(sink, keypair):
    payload = json.loads(_body(keypair))
    payload["sig"] = 12345
    r = _post(sink, json.dumps(payload).encode())
    assert r.status_code == 400 and r.json()["error"] == "bad_request"


def test_non_numeric_ts_is_400_not_500(sink, keypair):
    payload = json.loads(_body(keypair))
    payload["ts"] = "not-a-number"
    r = _post(sink, json.dumps(payload).encode())
    assert r.status_code == 400 and r.json()["error"] == "bad_request"


def test_boolean_counter_is_400(sink, keypair):
    payload = json.loads(_body(keypair))
    payload["counter"] = True
    r = _post(sink, json.dumps(payload).encode())
    assert r.status_code == 400 and r.json()["error"] == "bad_request"


def test_non_ascii_mac_is_401_not_500(sink, keypair):
    import socket
    body = _body(keypair)
    req = (b"POST /api/ingest HTTP/1.1\r\nHost: x\r\n"
           b"Content-Type: application/json\r\n"
           b"X-Beadz-Mac: \xff\xfe\r\n"
           + f"Content-Length: {len(body)}\r\n\r\n".encode() + body)
    with socket.create_connection(("127.0.0.1", sink.port), timeout=5) as s:
        s.sendall(req)
        resp = s.recv(1024).decode("latin-1")
    assert " 401 " in resp.splitlines()[0]


def test_absurd_counter_is_400(sink, keypair):
    payload = json.loads(_body(keypair))
    payload["counter"] = 10**400
    r = _post(sink, json.dumps(payload).encode())
    assert r.status_code == 400 and r.json()["error"] == "bad_request"


def test_last_seen_survives_restart(tmp_path, keypair):
    _, pub = keypair
    s1 = IngestSink(SECRET, pub, tmp_path / "sink", port=0)
    s1.start()
    try:
        assert _post(s1, _body(keypair, counter=3)).status_code == 200
    finally:
        s1.stop()
    s2 = IngestSink(SECRET, pub, tmp_path / "sink", port=0)
    s2.start()
    try:
        assert _post(s2, _body(keypair, counter=3)).status_code == 409
    finally:
        s2.stop()


def test_corrupt_last_seen_fails_loud(tmp_path, keypair):
    from beadz_camera.sink import SinkStateError
    _, pub = keypair
    sink_dir = tmp_path / "sink"
    sink_dir.mkdir()
    (sink_dir / "last_seen").write_text("not-a-number")
    with pytest.raises(SinkStateError):
        IngestSink(SECRET, pub, sink_dir, port=0)


def test_events_are_bounded(sink, keypair):
    from collections import deque
    assert isinstance(sink.events, deque)
    assert sink.events.maxlen == 1000
