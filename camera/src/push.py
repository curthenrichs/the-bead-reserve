"""HMAC-authed push to /api/ingest, oldest-first, stop on failure.

Contract (spec §5): 2xx = ack; 409 = counter-already-seen, treated as ack
(covers the crashed-after-ack case); anything else stops the drain so
counter order is preserved for the next timer run."""

from __future__ import annotations

import base64
import enum
import hashlib
import hmac
import json

import requests

from .config import Config
from .queue import QueuedFrame, StateDir

_TIMEOUT_S = 10


class PushError(RuntimeError):
    """Local file I/O failed while draining (not a network failure)."""


class PushOutcome(enum.Enum):
    OK = "ok"
    COUNTER_SEEN = "counter_seen"
    FAIL = "fail"


def hmac_hex(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def push_frame(cfg: Config, frame: QueuedFrame, session: requests.Session) -> PushOutcome:
    payload = dict(frame.meta)
    payload["image_b64"] = base64.b64encode(frame.jpg.read_bytes()).decode()
    body = json.dumps(payload).encode()
    try:
        resp = session.post(
            cfg.ingest_url,
            data=body,
            headers={
                "Content-Type": "application/json",
                "X-Beadz-Mac": hmac_hex(cfg.hmac_secret, body),
            },
            timeout=_TIMEOUT_S,
        )
    except requests.RequestException:
        return PushOutcome.FAIL
    if resp.status_code == 409:
        return PushOutcome.COUNTER_SEEN
    if 200 <= resp.status_code < 300:
        return PushOutcome.OK
    return PushOutcome.FAIL


def drain(cfg: Config, state: StateDir) -> dict:
    report = {"pushed": 0, "counter_seen": 0, "failed": False, "remaining": 0}
    snapshot = state.pending()  # ONE scan; under the state lock nothing else mutates
    archived = 0
    with requests.Session() as session:
        for frame in snapshot[: cfg.drain_batch_max]:
            try:
                outcome = push_frame(cfg, frame, session)
            except OSError as exc:
                raise PushError(f"frame {frame.counter}: {exc}") from exc
            if outcome is PushOutcome.FAIL:
                report["failed"] = True
                break
            state.archive(frame)
            archived += 1
            key = "pushed" if outcome is PushOutcome.OK else "counter_seen"
            report[key] += 1
    report["remaining"] = len(snapshot) - archived
    return report
