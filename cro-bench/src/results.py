"""Streamed run outputs.

results.jsonl (machine): run_start first, then call/audit records in
sweep order, run_end last — appended and flushed as the run goes, so a
crashed run still leaves a parseable prefix. transcript.md (human): the
artifact voice drift is judged from."""

from __future__ import annotations

import json
import time
from pathlib import Path


class RunWriter:
    def __init__(self, out_dir: Path):
        out_dir.mkdir(parents=True, exist_ok=True)
        self.out_dir = out_dir
        self._jsonl = (out_dir / "results.jsonl").open("a", encoding="utf-8")
        self._md = (out_dir / "transcript.md").open("a", encoding="utf-8")

    def _emit(self, record: dict) -> None:
        self._jsonl.write(json.dumps(record, ensure_ascii=False) + "\n")
        self._jsonl.flush()

    def _md_write(self, text: str) -> None:
        self._md.write(text)
        self._md.flush()

    def run_start(self, **fields) -> None:
        self._emit({"type": "run_start", "ts": int(time.time()), **fields})
        lines = "".join(f"- {k}: {v}\n" for k, v in fields.items())
        self._md_write(f"# CRO bench run\n\n{lines}\n")

    def call(self, variant: str, image: str, call_id: str, prompt: str,
             response: str | None = None, wall_ms: int | None = None,
             error: str | None = None) -> None:
        self._emit({"type": "call", "variant": variant, "image": image,
                    "call": call_id, "prompt": prompt, "response": response,
                    "wall_ms": wall_ms, "error": error})

    def audit(self, variant: str, image: str, answers: dict, timings_ms: dict,
              text: str | None, error: str | None = None) -> None:
        self._emit({"type": "audit", "variant": variant, "image": image,
                    "answers": answers, "text": text, "error": error})
        body = "".join(
            f"- `{cid}` → {ans}  ({timings_ms.get(cid)} ms)\n"
            for cid, ans in answers.items())
        if error:
            tail = f"\n**FAILED:** {error}\n\n"
        else:
            quoted = "> " + (text or "").replace("\n", "\n> ")
            tail = f"\n{quoted}\n\n"
        self._md_write(f"## {image} × {variant}\n\n{body}{tail}")

    def run_end(self, ok_calls: int, failed_calls: int,
                peak_rss_kb: int | None) -> None:
        self._emit({"type": "run_end", "ts": int(time.time()),
                    "ok_calls": ok_calls, "failed_calls": failed_calls,
                    "peak_rss_kb": peak_rss_kb})
        self._md_write(f"---\ncalls ok: {ok_calls} · failed: {failed_calls} · "
                       f"peak RSS kB: {peak_rss_kb}\n")
        self._jsonl.close()
        self._md.close()
