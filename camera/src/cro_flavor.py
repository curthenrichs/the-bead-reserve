"""Flavor selection for the CRO: mood-by-timestamp, best-of-N, junk filter.

is_junk rejects the streaky failures of a 500M model (bare ratings, fragments,
persona-echo). best_of_flavor keeps the first candidate clearing it (stopping
early), else the first candidate — the hourly stream tolerates an occasional
dull line. mood_for picks the intensity deterministically from the capture
timestamp, held hold_hours per phase. Ported from cro-bench/src/flavor.py."""

from __future__ import annotations

import re

from . import cro_assets
from .cro_calls import CallError, audit_call

MIN_WORDS = 4
ECHO_RATIO = 0.7
_BARE_NUMBER = re.compile(r"^\W*\d[\d\s.,%/-]*$")
_WORD = re.compile(r"[a-z0-9']+")


def _words(text: str) -> list[str]:
    return _WORD.findall(text.lower())


def is_junk(text: str, persona: str,
            min_words: int = MIN_WORDS, echo_ratio: float = ECHO_RATIO) -> bool:
    t = text.strip()
    if not t or _BARE_NUMBER.match(t):
        return True
    words = _words(t)
    if len(words) < min_words:
        return True
    persona_words = set(_words(persona))
    if persona_words and sum(w in persona_words for w in words) / len(words) > echo_ratio:
        return True
    return False


def mood_for(capture_ts: int, hold_hours: int) -> cro_assets.Mood:
    bucket = capture_ts // 3600 // hold_hours
    return cro_assets.MOODS[bucket % len(cro_assets.MOODS)]


def best_of_flavor(base_url: str, image_b64: str, capture_ts: int,
                   hold_hours: int, best_of: int, timeout: float, mime: str,
                   call=audit_call) -> str | None:
    mood = mood_for(capture_ts, hold_hours)
    prompt = f"{cro_assets.FLAVOR_TASK} {mood.cue}"
    candidates: list[str] = []
    for _ in range(best_of):
        try:
            text = call(base_url, cro_assets.FLAVOR_PERSONA, prompt, image_b64,
                        mood.sampling, grammar=None, timeout=timeout, mime=mime)
        except CallError:
            continue
        candidates.append(text)
        if not is_junk(text, cro_assets.FLAVOR_PERSONA):
            return text
    return candidates[0] if candidates else None
