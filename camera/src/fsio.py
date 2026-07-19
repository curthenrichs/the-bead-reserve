"""Shared atomic-write primitive.

PID-unique tmp name: capture-once and push-drain are separate processes that
may write near-simultaneously; a fixed tmp name would let one process clobber
the other's in-flight tmp file. One primitive, one guarantee — every state
write in this package goes through here."""

from __future__ import annotations

import os
from pathlib import Path


def atomic_write_text(path: Path, text: str) -> None:
    tmp = path.with_name(f"{path.name}.{os.getpid()}.tmp")
    tmp.write_text(text)
    os.replace(tmp, path)
