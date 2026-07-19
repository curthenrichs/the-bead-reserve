"""Observability output: status.json in the state root. A file, not an
endpoint — the future LAN dashboard renders it; the pipeline only writes."""

from __future__ import annotations

import json
import time
from pathlib import Path

from .fsio import atomic_write_text


def update_status(state_root: Path, min_interval_s: int = 0, **fields) -> None:
    state_root = Path(state_root)
    state_root.mkdir(parents=True, exist_ok=True)
    path = state_root / "status.json"
    try:
        current = json.loads(path.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        current = {}
    if min_interval_s > 0 and current:
        unchanged = all(current.get(k) == v for k, v in fields.items())
        fresh = (int(time.time()) - current.get("updated_ts", 0)) < min_interval_s
        if unchanged and fresh:
            return  # nothing changed and the heartbeat is still fresh — skip the SD write
    current.update(fields)
    current["updated_ts"] = int(time.time())
    atomic_write_text(path, json.dumps(current, indent=2))
