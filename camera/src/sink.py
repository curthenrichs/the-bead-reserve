"""Local ingest sink — the executable reference for subsystem B's contract.

Implements the ingest contract (see the §4 table in the ingest-sink design
spec): HMAC over the raw body, hash-of-bytes + Ed25519 verification reusing
the device's own primitives, counter monotonicity with a real 409, warn-only
timestamp skew. Dual use: imported by the integration tests, wrapped by
scripts/ingest-sink.py for watching a real Pi push over the LAN."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import threading
import time
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from .fsio import atomic_write_text
from .push import hmac_hex
from .sign import verify

_META_KEYS = ("counter", "ts", "sha256", "sig", "croText")
_TS_SKEW_WARN_S = 600
_EVENTS_MAX = 1000
_SUPPORTED_PROTOCOLS = frozenset({"1"})


class SinkStateError(RuntimeError):
    """The sink's persisted last_seen is corrupt — refuse to guess (a reset
    would silently reopen the replay hole the counter check exists to close)."""


class IngestSink:
    def __init__(self, secret: str, pubkey_hex: str, sink_dir: Path,
                 port: int = 0, bind: str = "127.0.0.1"):
        self.secret = secret
        self.pubkey_hex = pubkey_hex
        self.sink_dir = Path(sink_dir)
        self.frames_dir = self.sink_dir / "frames"
        self.frames_dir.mkdir(parents=True, exist_ok=True)
        self.bind = bind
        self.events: deque = deque(maxlen=_EVENTS_MAX)
        self._counter_lock = threading.Lock()
        self._last_seen = self._load_last_seen()
        self._server = ThreadingHTTPServer((bind, port), _make_handler(self))
        self._thread: threading.Thread | None = None

    # -- lifecycle -----------------------------------------------------------
    def start(self) -> None:
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._server.shutdown()
        self._server.server_close()
        if self._thread is not None:
            self._thread.join(timeout=5)

    @property
    def port(self) -> int:
        return self._server.server_address[1]

    @property
    def url(self) -> str:
        return f"http://{self.bind}:{self.port}/api/ingest"

    # -- state ---------------------------------------------------------------
    def _load_last_seen(self) -> int:
        path = self.sink_dir / "last_seen"
        try:
            return int(path.read_text().strip())
        except FileNotFoundError:
            return 0  # legitimate first run
        except ValueError as exc:
            raise SinkStateError(
                f"last_seen corrupt: {path} — refusing to reset replay protection "
                "to 0. Fix or remove it explicitly."
            ) from exc

    # -- the contract (spec §4 table; first failure wins) --------------------
    def handle_ingest(self, raw_body: bytes, mac_header: str | None,
                      protocol_header: str | None = None) -> tuple[int, dict]:
        # 1. HMAC over the exact raw body, constant-time
        if not mac_header or not hmac.compare_digest(
                mac_header.encode("latin-1", errors="replace"),
                hmac_hex(self.secret, raw_body).encode()):
            return self._reject(401, "bad_mac", None)
        # 1b. protocol gate — absent means "1"; present-but-unknown is a client error
        if protocol_header is not None and protocol_header not in _SUPPORTED_PROTOCOLS:
            return self._reject(400, "unsupported_protocol", None)
        # 2. shape
        try:
            payload = json.loads(raw_body)
            counter = payload["counter"]
            ts = payload["ts"]
            if (not isinstance(counter, int) or isinstance(counter, bool)
                    or not (0 < counter < 2**63)
                    or not isinstance(ts, int) or isinstance(ts, bool)
                    or not isinstance(payload["sha256"], str)
                    or not isinstance(payload["sig"], str)
                    or not isinstance(payload["image_b64"], str)
                    or not (payload["croText"] is None or isinstance(payload["croText"], str))):
                raise ValueError("bad shape")
            image = base64.b64decode(payload["image_b64"], validate=True)
        except (ValueError, KeyError, TypeError):
            return self._reject(400, "bad_request", None)
        # 3. hash of the actual bytes + Ed25519 — malformed hex is a client
        #    error (400), never a 500: sign.verify lets ValueError escape
        try:
            ok = (hashlib.sha256(image).hexdigest() == payload["sha256"]
                  and verify(self.pubkey_hex, payload["sha256"], payload["sig"]))
        except (ValueError, TypeError):
            ok = False
        if not ok:
            return self._reject(400, "bad_signature", counter)
        # 4. counter monotonicity (locked: don't assume a polite client)
        with self._counter_lock:
            if counter <= self._last_seen:
                return self._reject(409, "counter_seen", counter)
            # 5. ts skew: warn-marker only — backfill is legitimately old
            age = int(time.time()) - ts
            reason = f"age={age}s" + (" skew-warn" if abs(age) > _TS_SKEW_WARN_S else "")
            (self.frames_dir / f"{counter}.jpg").write_bytes(image)
            meta = {k: payload[k] for k in _META_KEYS}
            atomic_write_text(self.frames_dir / f"{counter}.json", json.dumps(meta))
            self._last_seen = counter
            atomic_write_text(self.sink_dir / "last_seen", f"{counter}\n")
        self._log("accept", 200, counter, reason)
        return 200, {"ok": True, "counter": counter}

    def _reject(self, status: int, reason: str, counter) -> tuple[int, dict]:
        self._log("reject", status, counter, reason)
        return status, {"error": reason}

    def _log(self, outcome: str, status: int, counter, reason: str) -> None:
        self.events.append({"outcome": outcome, "status": status,
                            "counter": counter, "reason": reason})
        label = "ACCEPT" if outcome == "accept" else f"REJECT {status}"
        print(f"{label} counter={counter} {reason}", flush=True)


def _make_handler(sink: IngestSink):
    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            if self.path != "/api/ingest":
                return self._respond(404, {"error": "not_found"})
            try:
                length = int(self.headers.get("Content-Length") or 0)
            except ValueError:
                return self._respond(400, {"error": "bad_request"})
            raw = self.rfile.read(length)
            try:
                status, body = sink.handle_ingest(
                    raw,
                    self.headers.get("X-Beadz-Mac"),
                    self.headers.get("X-Beadz-Protocol"),
                )
            except Exception as exc:  # storage failure etc.; device treats as FAIL
                print(f"SINK ERROR: {exc}", flush=True)
                status, body = 500, {"error": "internal"}
            self._respond(status, body)

        def do_GET(self):
            self._respond(405, {"error": "method_not_allowed"})

        def _respond(self, status: int, body: dict) -> None:
            data = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, *args):  # silence the default stderr access log
            pass

    return Handler
