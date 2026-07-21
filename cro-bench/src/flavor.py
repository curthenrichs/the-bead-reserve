"""Flavor-sentence quality filter for best-of-N selection.

A 500M model's free flavor sentence is streaky: it sometimes emits a bare
rating ("5."), a one-word fragment ("Yes."), or parrots its own persona back.
best-of-N in the CLI generates flavor candidates and keeps the FIRST that
clears this filter (stopping early); if none clear it, it falls back to the
first candidate. is_junk() is the reject predicate, kept pure and testable
here so the reject rules are one obvious place."""

from __future__ import annotations

import re

MIN_WORDS = 4
ECHO_RATIO = 0.7
# A bare rating/number: an optional sign/punctuation wrapper around digits and
# separators only, no letters — "5.", "40", "0.", "9 / 10".
_BARE_NUMBER = re.compile(r"^\W*\d[\d\s.,%/-]*$")
_WORD = re.compile(r"[a-z0-9']+")


def _words(text: str) -> list[str]:
    return _WORD.findall(text.lower())


def is_junk(text: str, persona: str,
            min_words: int = MIN_WORDS, echo_ratio: float = ECHO_RATIO) -> bool:
    """True if this flavor candidate should be rejected: empty, a bare number,
    too short, or mostly the persona text echoed back (word overlap over
    echo_ratio of the candidate's own words)."""
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
