"""audit_call request/response contract against a faked llama-server.

The `grammar` field is llama-server's GBNF extension on chat completions;
n_predict maps to max_tokens; the image rides as a base64 data URI."""

import json

import pytest
import requests
import responses

from beadz_cro_bench.calls import CallError, audit_call, encode_image

URL = "http://127.0.0.1:8091"
EP = f"{URL}/v1/chat/completions"
SAMPLING = {"temperature": 0.0, "n_predict": 8}


def _ok_body(content=" nominal \n"):
    return {"choices": [{"message": {"content": content}}]}


@responses.activate
def test_slot_call_request_shape():
    responses.add(responses.POST, EP, json=_ok_body())
    text, wall_ms = audit_call(URL, "You are the CRO.", "Level?", "aGk=",
                               SAMPLING, grammar='root ::= "nominal"')
    assert text == "nominal"
    assert isinstance(wall_ms, int)
    body = json.loads(responses.calls[0].request.body)
    assert body["grammar"] == 'root ::= "nominal"'
    assert body["temperature"] == 0.0
    assert body["max_tokens"] == 8
    assert body["messages"][0] == {"role": "system", "content": "You are the CRO."}
    user = body["messages"][1]
    assert user["content"][0] == {"type": "text", "text": "Level?"}
    assert user["content"][1]["image_url"]["url"] == "data:image/jpeg;base64,aGk="


@responses.activate
def test_flavor_call_omits_grammar():
    responses.add(responses.POST, EP, json=_ok_body("The beads persist."))
    text, _ = audit_call(URL, "p", "Remark.", "aGk=",
                         {"temperature": 0.7, "n_predict": 60})
    assert text == "The beads persist."
    body = json.loads(responses.calls[0].request.body)
    assert "grammar" not in body
    assert body["max_tokens"] == 60


@responses.activate
def test_non_200_raises():
    responses.add(responses.POST, EP, status=503, body="loading")
    with pytest.raises(CallError, match="HTTP 503"):
        audit_call(URL, "p", "q", "aGk=", SAMPLING)


@responses.activate
def test_malformed_body_raises():
    responses.add(responses.POST, EP, json={"nope": True})
    with pytest.raises(CallError, match="malformed"):
        audit_call(URL, "p", "q", "aGk=", SAMPLING)


@responses.activate
def test_connection_error_raises():
    # requests.ConnectionError, not the builtin — audit_call catches
    # requests.RequestException only.
    responses.add(responses.POST, EP, body=requests.ConnectionError("refused"))
    with pytest.raises(CallError, match="request failed"):
        audit_call(URL, "p", "q", "aGk=", SAMPLING)


@responses.activate
def test_mime_param_sets_data_uri_type():
    responses.add(responses.POST, EP, json=_ok_body())
    audit_call(URL, "p", "q", "aGk=", SAMPLING, mime="image/png")
    body = json.loads(responses.calls[0].request.body)
    assert body["messages"][1]["content"][1]["image_url"]["url"] == \
        "data:image/png;base64,aGk="


def test_encode_image(tmp_path):
    p = tmp_path / "a.jpg"
    p.write_bytes(b"hi")
    assert encode_image(p) == "aGk="
