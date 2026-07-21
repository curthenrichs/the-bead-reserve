"""Chief Reserve Officer. NullCRO (default) leaves croText absent — the pipeline
runs the identical code path. SmolVLMCRO spawns llama-server per capture, reads
grammar-constrained slots, generates one mood-rotating flavor sentence, and
renders the audit template. It is strictly optional and NEVER load-bearing:
audit() never raises; on any failure it returns None and capture/sign/push
proceed. See docs/superpowers/specs/2026-07-20-cro-pi-integration-design.md."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Protocol

from . import cro_assets, cro_calls, cro_flavor, llama_server


class CRO(Protocol):
    def audit(self, image_path: Path, capture_ts: int) -> str | None: ...


class NullCRO:
    def audit(self, image_path: Path, capture_ts: int) -> str | None:
        return None


class SmolVLMCRO:
    def __init__(self, cfg):
        self.cfg = cfg
        self.port = 8099

    def audit(self, image_path: Path, capture_ts: int) -> str | None:
        cfg = self.cfg
        proc = None
        try:
            image_b64 = cro_calls.encode_image(image_path)
            mime = "image/png" if Path(image_path).suffix.lower() == ".png" else "image/jpeg"
            proc, base_url = llama_server.start_server(
                cfg.cro_server_bin, cfg.cro_model_path, cfg.cro_mmproj_path,
                self.port, cfg.cro_ctx_size, load_timeout=cfg.cro_timeout_s)
            answers = {}
            for slot in cro_assets.SLOTS:
                answers[slot.id] = cro_calls.audit_call(
                    base_url, cro_assets.PERSONA, slot.prompt, image_b64,
                    cro_assets.SLOT_SAMPLING, grammar=slot.grammar,
                    timeout=cfg.cro_timeout_s, mime=mime)
            flavor = cro_flavor.best_of_flavor(
                base_url, image_b64, capture_ts, cfg.cro_mood_hold_hours,
                cfg.cro_best_of, cfg.cro_timeout_s, mime)
            if flavor is None:
                return None
            answers[cro_assets.FLAVOR_ID] = flavor
            return cro_assets.render(answers)
        except Exception as exc:
            # Advisory + never load-bearing: ANY failure (server, call, decode,
            # or anything unforeseen) degrades to croText=null. Broad on purpose;
            # KeyboardInterrupt/BaseException still propagate.
            print(f"CRO audit skipped: {exc}", file=sys.stderr)
            return None
        finally:
            if proc is not None:
                try:
                    llama_server.stop_server(proc)
                except Exception:
                    pass


def get_cro(cfg) -> CRO:
    if getattr(cfg, "cro_impl", "null") == "smolvlm":
        return SmolVLMCRO(cfg)
    return NullCRO()
