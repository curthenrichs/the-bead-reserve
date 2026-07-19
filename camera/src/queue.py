"""On-disk pipeline state: monotonic counter, frame queue, archive.

Crash-safety invariants:
- every write is write-tmp-then-os.replace (atomic on POSIX and NTFS);
- a frame's .jpg lands before its .json, so a .json present means its
  .jpg is complete — no crash can leave a pushable half-frame;
- the counter is never guessed: missing/corrupt raises CounterError and
  a human seeds it explicitly (a reused counter would be a replay hole)."""

from __future__ import annotations

import json
import os
import shutil
from dataclasses import dataclass
from pathlib import Path

from .fsio import atomic_write_text


class CounterError(RuntimeError):
    pass


@dataclass(frozen=True)
class QueuedFrame:
    counter: int
    jpg: Path
    json_path: Path
    meta: dict


class StateDir:
    def __init__(self, root: Path):
        self.root = Path(root)
        self.queue_dir = self.root / "queue"
        self.archive_dir = self.root / "archive"
        self.queue_dir.mkdir(parents=True, exist_ok=True)
        self.archive_dir.mkdir(parents=True, exist_ok=True)

    @property
    def _counter_file(self) -> Path:
        return self.root / "counter"

    def seed_counter(self, value: int = 0, force: bool = False) -> None:
        if self._counter_file.exists() and not force:
            raise FileExistsError(f"counter already seeded: {self._counter_file}")
        atomic_write_text(self._counter_file, f"{value}\n")

    def next_counter(self) -> int:
        try:
            current = int(self._counter_file.read_text().strip())
        except FileNotFoundError as exc:
            raise CounterError(
                f"counter file missing: {self._counter_file} — seed it explicitly "
                "with `/opt/beadz-camera/venv/bin/beadz-camera seed-counter`"
            ) from exc
        except ValueError as exc:
            raise CounterError(
                f"counter file corrupt: {self._counter_file} — refusing to guess. "
                "Recover with `/opt/beadz-camera/venv/bin/beadz-camera seed-counter --force --value N` where N "
                "is GREATER than the highest counter the backend has seen (a reused "
                "counter is rejected as a replay)."
            ) from exc
        value = current + 1
        atomic_write_text(self._counter_file, f"{value}\n")
        return value

    def enqueue(self, counter: int, jpg_src: Path, meta: dict) -> None:
        jpg_dest = self.queue_dir / f"{counter}.jpg"
        # jpg first (atomic move into place), json second — see module docstring
        tmp_jpg = jpg_dest.with_name(jpg_dest.name + ".tmp")
        shutil.move(str(jpg_src), tmp_jpg)
        os.replace(tmp_jpg, jpg_dest)
        atomic_write_text(self.queue_dir / f"{counter}.json", json.dumps(meta))

    def pending(self) -> list[QueuedFrame]:
        # NOTE: a corrupt frame json raises JSONDecodeError from json.loads below, intentionally stalling the whole drain (fail-loud) rather than silently skipping frames.
        # Reclaim jpgs orphaned by a crashed enqueue (jpg written, json never
        # committed). enqueue and pending both run under the state lock, so a
        # queue jpg with no sibling json is always a dead-process artifact.
        for stray in self.queue_dir.glob("*.jpg"):
            try:
                int(stray.stem)
            except ValueError:
                continue  # not a frame file (manual artifact); leave it alone
            if not stray.with_suffix(".json").exists():
                stray.unlink()
        frames = []
        for json_path in self.queue_dir.glob("*.json"):
            try:
                counter = int(json_path.stem)
            except ValueError:
                continue  # not a frame file (manual artifact); ignore
            jpg = self.queue_dir / f"{counter}.jpg"
            if not jpg.exists():
                # Two crash shapes look like this: mid-enqueue (no jpg anywhere —
                # benign, jpg-first ordering) or mid-archive (jpg already moved to
                # archive/). For the latter, finish the interrupted move.
                if (self.archive_dir / f"{counter}.jpg").exists():
                    os.replace(json_path, self.archive_dir / json_path.name)
                continue
            frames.append(
                QueuedFrame(counter, jpg, json_path, json.loads(json_path.read_text()))
            )
        return sorted(frames, key=lambda f: f.counter)

    def archive(self, frame: QueuedFrame) -> None:
        os.replace(frame.jpg, self.archive_dir / frame.jpg.name)
        os.replace(frame.json_path, self.archive_dir / frame.json_path.name)
