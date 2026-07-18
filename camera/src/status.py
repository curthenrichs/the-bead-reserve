"""Observability output: status.json in the state root. A file, not an
endpoint — the future LAN dashboard renders it; the pipeline only writes."""

from __future__ import annotations

import json
import os
import time
from pathlib import Path


def update_status(state_root: Path, **fields) -> None:
    state_root = Path(state_root)
    state_root.mkdir(parents=True, exist_ok=True)
    path = state_root / "status.json"
    try:
        current = json.loads(path.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        current = {}
    current.update(fields)
    current["updated_ts"] = int(time.time())
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(current, indent=2))
    os.replace(tmp, path)
