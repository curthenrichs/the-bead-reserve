"""Keep the committed canonical mood set honest (moods.json feeds the
production CRO per the 2026-07-20 integration spec)."""

import json
from pathlib import Path

MOODS = Path(__file__).resolve().parents[1] / "moods.json"


def test_moods_json_shape():
    cfg = json.loads(MOODS.read_text(encoding="utf-8"))
    assert isinstance(cfg["hold_hours"], int) and cfg["hold_hours"] >= 1
    assert isinstance(cfg["best_of"], int) and cfg["best_of"] >= 1
    moods = cfg["moods"]
    assert len(moods) >= 2
    labels = [m["label"] for m in moods]
    assert len(set(labels)) == len(labels)          # unique labels
    for m in moods:
        assert m["label"] and m["cue"]
        assert isinstance(m["sampling"], dict) and m["sampling"]
        assert "temperature" in m["sampling"] and "n_predict" in m["sampling"]


def test_mood_selection_holds_and_cycles():
    cfg = json.loads(MOODS.read_text(encoding="utf-8"))
    moods, hold = cfg["moods"], cfg["hold_hours"]
    pick = lambda hour: moods[(hour // hold) % len(moods)]["label"]
    # holds for `hold` hours, then shifts; deterministic per hour
    assert pick(0) == pick(hold - 1)                 # same phase
    assert pick(0) != pick(hold) or len(moods) == 1  # shifts at the boundary
    assert pick(0) == pick(hold * len(moods))        # wraps around
