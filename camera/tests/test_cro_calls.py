import json

import pytest
import requests
import responses

from beadz_camera.cro_calls import CallError, audit_call, encode_image

URL = "http://127.0.0.1:8099"
EP = f"{URL}/v1/chat/completions"


def _ok(content=" nominal \n"):
    return {"choices": [{"message": {"content": content}}]}


@responses.activate
def test_slot_call_shape():
    responses.add(responses.POST, EP, json=_ok())
    out = audit_call(URL, "persona", "Level?", "aGk=",
                     {"temperature": 0.0, "n_predict": 8}, grammar='root ::= "nominal"')
    assert out == "nominal"
    body = json.loads(responses.calls[0].request.body)
    assert body["grammar"] == 'root ::= "nominal"'
    assert body["max_tokens"] == 8 and body["temperature"] == 0.0
    assert body["messages"][0] == {"role": "system", "content": "persona"}
    assert body["messages"][1]["content"][1]["image_url"]["url"] == "data:image/jpeg;base64,aGk="


@responses.activate
def test_flavor_forwards_all_knobs_no_grammar():
    responses.add(responses.POST, EP, json=_ok("The beads persist."))
    audit_call(URL, "p", "Remark.", "aGk=",
               {"temperature": 1.3, "top_p": 0.97, "min_p": 0.03, "n_predict": 80})
    body = json.loads(responses.calls[0].request.body)
    assert "grammar" not in body
    assert body["top_p"] == 0.97 and body["min_p"] == 0.03 and body["max_tokens"] == 80


@responses.activate
def test_non_200_raises():
    responses.add(responses.POST, EP, status=503, body="loading")
    with pytest.raises(CallError, match="HTTP 503"):
        audit_call(URL, "p", "q", "aGk=", {"temperature": 0.0, "n_predict": 8})


@responses.activate
def test_malformed_raises():
    responses.add(responses.POST, EP, json={"nope": 1})
    with pytest.raises(CallError, match="malformed"):
        audit_call(URL, "p", "q", "aGk=", {"temperature": 0.0, "n_predict": 8})


@responses.activate
def test_transport_raises():
    responses.add(responses.POST, EP, body=requests.ConnectionError("x"))
    with pytest.raises(CallError, match="request failed"):
        audit_call(URL, "p", "q", "aGk=", {"temperature": 0.0, "n_predict": 8})


def test_encode_image(tmp_path):
    p = tmp_path / "a.jpg"
    p.write_bytes(b"hi")
    assert encode_image(p) == "aGk="
