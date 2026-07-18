"""Device-side pipeline configuration, loaded from device.env + environment."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

_REQUIRED = (
    "INGEST_URL",
    "HMAC_SECRET",
    "CAMERA_DEVICE",
    "CROP_RECT",
    "STATE_DIR",
    "ED25519_KEY_PATH",
)


@dataclass(frozen=True)
class Config:
    ingest_url: str
    hmac_secret: str
    camera_device: str
    crop_rect: tuple[int, int, int, int]  # x, y, w, h
    state_dir: Path
    key_path: Path
    drain_batch_max: int = 20

    @classmethod
    def from_env(cls, env_file: Path | None = None) -> "Config":
        if env_file is not None:
            # override=True: the file wins. dotenv mutates os.environ process-wide,
            # so file-wins keeps repeated loads (and tests) deterministic.
            load_dotenv(env_file, override=True)
        missing = [k for k in _REQUIRED if not os.environ.get(k)]
        if missing:
            raise ValueError(f"missing required config: {', '.join(missing)}")
        parts = os.environ["CROP_RECT"].split(",")
        if len(parts) != 4:
            raise ValueError("CROP_RECT must be 'x,y,w,h' (four integers)")
        try:
            x, y, w, h = (int(p) for p in parts)
        except ValueError as exc:
            raise ValueError("CROP_RECT must be 'x,y,w,h' (four integers)") from exc
        try:
            drain_batch_max = int(os.environ.get("DRAIN_BATCH_MAX") or 20)
        except ValueError as exc:
            raise ValueError("DRAIN_BATCH_MAX must be an integer") from exc
        return cls(
            ingest_url=os.environ["INGEST_URL"],
            hmac_secret=os.environ["HMAC_SECRET"],
            camera_device=os.environ["CAMERA_DEVICE"],
            crop_rect=(x, y, w, h),
            state_dir=Path(os.environ["STATE_DIR"]),
            key_path=Path(os.environ["ED25519_KEY_PATH"]),
            drain_batch_max=drain_batch_max,
        )
