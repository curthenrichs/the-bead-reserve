"""Canonical 'same guy, shifting moods' CRO rotation demo.

ONE persona (variants/v5-flustered/flavor_persona.txt); the mood/intensity
rotates, chosen deterministically from the capture timestamp and HELD for a few
hours (moods.json hold_hours) so it reads as a phase, not per-hour noise. This
is the reference the production CRO (docs/.../2026-07-20-cro-pi-integration-design.md)
bakes in — the seed there is the real capture ts; here we simulate a run of
hours over sample frames.

Reuses the bench's own building blocks (server lifecycle, call layer, best-of-N
junk filter). Run from cro-bench/ after `fetch-models` and a llama-server build:

    python mood_rotation.py --server-bin /path/to/llama-server --hours 12
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from beadz_cro_bench import calls, flavor, server
from beadz_cro_bench.variant import load_variant

HERE = Path(__file__).resolve().parent
TASK = "In one sentence, give your personal opinion on the state of the reserve."


def mood_for(hour: int, moods: list, hold_hours: int) -> dict:
    """Deterministic + auditable: (ts_hour // hold) picks the mood, so any hour
    recomputes to the same one. In production the hour comes from the capture ts."""
    return moods[(hour // hold_hours) % len(moods)]


def flavor_line(base_url, persona, prompt, image_b64, sampling, best_of):
    """best-of-N: first candidate clearing the junk filter, else the first."""
    candidates = []
    for _ in range(best_of):
        try:
            text, _ = calls.audit_call(base_url, persona, prompt, image_b64,
                                       sampling, grammar=None, timeout=600)
        except calls.CallError as exc:
            print(f"  (call error: {exc})", file=sys.stderr)
            continue
        candidates.append(text)
        if not flavor.is_junk(text, persona):
            return text, False
    return (candidates[0] if candidates else "(all attempts errored)"), True


def main() -> int:
    ap = argparse.ArgumentParser(description="CRO mood-rotation demo")
    ap.add_argument("--server-bin", default="llama-server")
    ap.add_argument("--model", type=Path, default=HERE / "models/SmolVLM-500M-Instruct-Q8_0.gguf")
    ap.add_argument("--mmproj", type=Path, default=HERE / "models/mmproj-SmolVLM-500M-Instruct-Q8_0.gguf")
    ap.add_argument("--images", type=Path, default=HERE / "samples")
    ap.add_argument("--port", type=int, default=8099)
    ap.add_argument("--hours", type=int, default=12)
    args = ap.parse_args()

    persona = load_variant(HERE / "variants/v5-flustered").flavor_persona
    cfg = json.loads((HERE / "moods.json").read_text(encoding="utf-8"))
    moods, hold, best_of = cfg["moods"], cfg["hold_hours"], cfg["best_of"]
    frames = sorted(p for p in args.images.glob("*.jpg"))
    if not frames:
        print(f"no frames in {args.images}", file=sys.stderr)
        return 2
    encoded = [calls.encode_image(p) for p in frames]

    proc, base_url, load_s = server.start_server(
        args.server_bin, args.model, args.mmproj, args.port)
    print(f"server up in {load_s}s; mood = moods[(hour // {hold}) % {len(moods)}], "
          f"best-of-{best_of}\n" + "=" * 68)
    try:
        last = None
        for hour in range(args.hours):
            mood = mood_for(hour, moods, hold)
            shift = "  <- mood shift" if mood["label"] != last else ""
            last = mood["label"]
            prompt = f"{TASK} {mood['cue']}"
            line, junk = flavor_line(base_url, persona, prompt,
                                     encoded[hour % len(encoded)], mood["sampling"], best_of)
            tag = " [filter fell back — dull hour]" if junk else ""
            print(f"hour {hour:>2} | {mood['label']:<10}{shift}\n        {line}{tag}\n")
    finally:
        server.stop_server(proc)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
