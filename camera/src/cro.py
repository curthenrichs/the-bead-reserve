"""Chief Reserve Officer slot. v1 ships NullCRO — the pipeline runs the
identical code path with croText absent. The SmolVLM implementation
(pi-camera-processor.md §5: grammar-constrained slots + one flavor
sentence) plugs in here later; nothing upstream changes."""

from __future__ import annotations

from pathlib import Path
from typing import Protocol


class CRO(Protocol):
    def audit(self, image_path: Path) -> str | None: ...


class NullCRO:
    def audit(self, image_path: Path) -> str | None:
        return None


def get_cro(name: str = "null") -> CRO:
    if name == "null":
        return NullCRO()
    raise ValueError(f"unknown CRO implementation: {name!r}")
