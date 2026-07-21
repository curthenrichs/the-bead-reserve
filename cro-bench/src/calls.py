"""One audit call against llama-server's chat-completions endpoint.

Grammar-constrained slots send GBNF text in llama-server's `grammar`
extension field; the flavor call omits it. The image rides inline as a
base64 data URI. Every key in a variant's sampling dict is forwarded to
the endpoint verbatim — so a variant can turn up the heat with top_p,
top_k, min_p, or repeat_penalty, not just temperature. The one rename:
llama.cpp's `n_predict` is the OpenAI-compatible endpoint's `max_tokens`."""

from __future__ import annotations

import base64
import time
from pathlib import Path

import requests


class CallError(RuntimeError):
    pass


def encode_image(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("ascii")


def audit_call(base_url: str, persona: str, prompt: str, image_b64: str,
               sampling: dict, grammar: str | None = None,
               timeout: float = 600.0, mime: str = "image/jpeg") -> tuple[str, int]:
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
    # Forward every sampling knob verbatim; n_predict is the endpoint's
    # max_tokens. Defaults apply only when the variant is silent.
    for key, value in sampling.items():
        body["max_tokens" if key == "n_predict" else key] = value
    body.setdefault("temperature", 0.0)
    body.setdefault("max_tokens", 32)
    if grammar is not None:
        body["grammar"] = grammar
    t0 = time.monotonic()
    try:
        resp = requests.post(f"{base_url}/v1/chat/completions", json=body,
                             timeout=timeout)
    except requests.RequestException as exc:
        raise CallError(f"request failed: {exc}") from exc
    wall_ms = int((time.monotonic() - t0) * 1000)
    if resp.status_code != 200:
        raise CallError(f"HTTP {resp.status_code}: {resp.text[:200]}")
    try:
        text = resp.json()["choices"][0]["message"]["content"]
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        raise CallError(f"malformed response: {exc}") from exc
    if not isinstance(text, str):
        raise CallError("malformed response: content is not a string")
    return text.strip(), wall_ms
