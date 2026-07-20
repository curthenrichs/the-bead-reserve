"""Pinned model download + SHA-256 verification.

MODELS maps quant -> ((filename, sha256), ...) under the upstream repo.
A None hash is a pinning workflow state only: cmd_fetch completes the
download, prints the digest to paste here, and exits 1 — the committed
constant must always be fully pinned (tests enforce it)."""

from __future__ import annotations

import hashlib
from pathlib import Path

import requests

_BASE = "https://huggingface.co/ggml-org/SmolVLM-500M-Instruct-GGUF/resolve/main"
_CHUNK = 1 << 20

MODELS: dict[str, tuple[tuple[str, str | None], ...]] = {
    "Q8_0": (
        ("SmolVLM-500M-Instruct-Q8_0.gguf",
         "9d4612de6a42214499e301494a3ecc2be0abdd9de44e663bda63f1152fad1bf4"),
        ("mmproj-SmolVLM-500M-Instruct-Q8_0.gguf",
         "d1eb8b6b23979205fdf63703ed10f788131a3f812c7b1f72e0119d5d81295150"),
    ),
}


class FetchError(RuntimeError):
    pass


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while chunk := f.read(_CHUNK):
            h.update(chunk)
    return h.hexdigest()


def download_verified(url: str, dest: Path, expected_sha: str | None) -> str:
    if dest.is_file() and expected_sha and _sha256(dest) == expected_sha:
        return expected_sha
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_suffix(dest.suffix + ".part")
    h = hashlib.sha256()
    try:
        with requests.get(url, stream=True, timeout=60) as resp:
            if resp.status_code != 200:
                raise FetchError(f"HTTP {resp.status_code} for {url}")
            with part.open("wb") as f:
                for chunk in resp.iter_content(_CHUNK):
                    h.update(chunk)
                    f.write(chunk)
    except requests.RequestException as exc:
        part.unlink(missing_ok=True)
        raise FetchError(f"download failed: {exc}") from exc
    digest = h.hexdigest()
    if expected_sha is not None and digest != expected_sha:
        part.unlink()
        raise FetchError(
            f"sha256 mismatch for {dest.name}: got {digest}, want {expected_sha}")
    part.replace(dest)
    return digest


def cmd_fetch(quant: str, models_dir: Path = Path("models")) -> int:
    if quant not in MODELS:
        raise FetchError(f"unknown quant {quant!r}; available: {sorted(MODELS)}")
    unpinned = False
    for filename, sha in MODELS[quant]:
        digest = download_verified(f"{_BASE}/{filename}", models_dir / filename, sha)
        if sha is None:
            print(f"UNPINNED {filename} sha256={digest} — pin this in fetch.MODELS")
            unpinned = True
        else:
            print(f"ok {filename}")
    return 1 if unpinned else 0
