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


class ConfigError(ValueError):
    """A device.env problem the operator must fix (bad or missing key)."""


@dataclass(frozen=True)
class Config:
    ingest_url: str
    hmac_secret: str
    camera_device: str
    crop_rect: tuple[int, int, int, int]  # x, y, w, h
    state_dir: Path
    key_path: Path
    drain_batch_max: int = 20
    capture_resolution: tuple[int, int] | None = None
    camera_controls: tuple[tuple[str, str], ...] | None = None
    capture_skip: int = 0

    @classmethod
    def from_env(cls, env_file: Path | None = None) -> "Config":
        if env_file is not None:
            # override=True: the file wins. dotenv mutates os.environ process-wide,
            # so file-wins keeps repeated loads (and tests) deterministic.
            load_dotenv(env_file, override=True)
        missing = [k for k in _REQUIRED if not os.environ.get(k)]
        if missing:
            raise ConfigError(f"missing required config: {', '.join(missing)}")
        try:
            x, y, w, h = (int(p) for p in os.environ["CROP_RECT"].split(","))
        except ValueError as exc:
            raise ConfigError("CROP_RECT must be 'x,y,w,h' (four integers)") from exc
        try:
            drain_batch_max = int(os.environ.get("DRAIN_BATCH_MAX") or 20)
        except ValueError as exc:
            raise ConfigError("DRAIN_BATCH_MAX must be an integer") from exc
        if drain_batch_max < 1:
            raise ConfigError("DRAIN_BATCH_MAX must be >= 1")
        capture_resolution = None
        cap_res_raw = os.environ.get("CAPTURE_RESOLUTION")
        if cap_res_raw:
            try:
                cw, ch = (int(p) for p in cap_res_raw.lower().split("x"))
                if cw < 1 or ch < 1:
                    raise ValueError("non-positive")
            except ValueError as exc:
                raise ConfigError("CAPTURE_RESOLUTION must be 'WxH' (e.g. 1280x720)") from exc
            capture_resolution = (cw, ch)
        camera_controls = None
        cc_raw = os.environ.get("CAMERA_CONTROLS")
        if cc_raw:
            pairs = []
            for item in cc_raw.split(","):
                name, sep, value = item.partition("=")   # split on FIRST '='
                name, value = name.strip(), value.strip()
                if not sep or not name or not value:
                    raise ConfigError(
                        "CAMERA_CONTROLS must be 'name=value,name=value'")
                pairs.append((name, value))
            camera_controls = tuple(pairs)
        try:
            capture_skip = int(os.environ.get("CAPTURE_SKIP") or 0)
        except ValueError as exc:
            raise ConfigError("CAPTURE_SKIP must be a non-negative integer") from exc
        if capture_skip < 0:
            raise ConfigError("CAPTURE_SKIP must be a non-negative integer")
        return cls(
            ingest_url=os.environ["INGEST_URL"],
            hmac_secret=os.environ["HMAC_SECRET"],
            camera_device=os.environ["CAMERA_DEVICE"],
            crop_rect=(x, y, w, h),
            state_dir=Path(os.environ["STATE_DIR"]),
            key_path=Path(os.environ["ED25519_KEY_PATH"]),
            drain_batch_max=drain_batch_max,
            capture_resolution=capture_resolution,
            camera_controls=camera_controls,
            capture_skip=capture_skip,
        )
