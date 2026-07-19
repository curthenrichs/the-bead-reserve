"""Tight crop inside the box + EXIF strip.

Re-encoding through Pillow without passing `exif=` drops all metadata
(EXIF incl. GPS). Opsec: the crop is what keeps room/background pixels
out of every published frame."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, UnidentifiedImageError


class ProcessError(RuntimeError):
    pass


def crop_and_strip(
    src: Path,
    dest: Path,
    crop_rect: tuple[int, int, int, int],
    quality: int = 85,
) -> None:
    x, y, w, h = crop_rect
    try:
        with Image.open(src) as img:
            img.load()
            iw, ih = img.size
            if x < 0 or y < 0 or x + w > iw or y + h > ih:
                # ProcessError is a RuntimeError, so the except below (OSError/
                # UnidentifiedImageError) does not swallow it — it propagates.
                raise ProcessError(
                    f"crop {crop_rect} exceeds frame {iw}x{ih}: check CROP_RECT "
                    "against the camera's actual resolution"
                )
            cropped = img.convert("RGB").crop((x, y, x + w, y + h))
    except (OSError, UnidentifiedImageError) as exc:
        raise ProcessError(f"cannot process frame {src}: {exc}") from exc
    cropped.save(dest, format="JPEG", quality=quality)
