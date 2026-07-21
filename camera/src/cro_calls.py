"""One CRO audit call against llama-server's chat-completions endpoint.

Grammar-constrained slots send GBNF in the `grammar` field; the flavor call
omits it. Every sampling key is forwarded verbatim (n_predict -> max_tokens).
Ported from cro-bench/src/calls.py without the per-call timing return."""

from __future__ import annotations

import base64
from pathlib import Path

import requests


class CallError(RuntimeError):
    pass


def encode_image(path: Path) -> str:
    return base64.b64encode(Path(path).read_bytes()).decode("ascii")


def audit_call(base_url: str, persona: str, prompt: str, image_b64: str,
               sampling: dict, grammar: str | None = None,
               timeout: float = 180.0, mime: str = "image/jpeg") -> str:
    body = {
        "messages": [
            {"role": "system", "content": persona},
            {"role": "user", "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url",
                 "image_url": {"url": f"data:{mime};base64,{image_b64}"}},
            ]},
        ],
    }
    for key, value in sampling.items():
        body["max_tokens" if key == "n_predict" else key] = value
    body.setdefault("temperature", 0.0)
    body.setdefault("max_tokens", 32)
    if grammar is not None:
        body["grammar"] = grammar
    try:
        resp = requests.post(f"{base_url}/v1/chat/completions", json=body, timeout=timeout)
    except requests.RequestException as exc:
        raise CallError(f"request failed: {exc}") from exc
    if resp.status_code != 200:
        raise CallError(f"HTTP {resp.status_code}: {resp.text[:200]}")
    try:
        text = resp.json()["choices"][0]["message"]["content"]
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        raise CallError(f"malformed response: {exc}") from exc
    if not isinstance(text, str):
        raise CallError("malformed response: content is not a string")
    return text.strip()
