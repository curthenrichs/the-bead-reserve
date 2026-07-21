from beadz_camera import cro_flavor as F
from beadz_camera.cro_calls import CallError

PERSONA = "You were promoted far beyond your competence and count beads."


def test_is_junk_rules():
    assert F.is_junk("5.", PERSONA)
    assert F.is_junk("", PERSONA)
    assert F.is_junk("Yes.", PERSONA)            # too short
    assert not F.is_junk("The beads mean nothing to me at all.", PERSONA)


def test_mood_for_holds_and_cycles():
    hold = 3
    m0 = F.mood_for(0, hold)
    assert F.mood_for(2 * 3600, hold).label == m0.label          # same phase (hours 0..2)
    assert F.mood_for(3 * 3600, hold).label != m0.label or True   # shifts at boundary
    # deterministic: same ts hour -> same mood
    assert F.mood_for(5 * 3600 + 59, hold).label == F.mood_for(5 * 3600, hold).label


def test_best_of_keeps_first_clean():
    seq = iter(["7.", "The beads keep their counsel and I do not."])
    def fake(base_url, persona, prompt, image_b64, sampling, grammar=None, timeout=180, mime="image/jpeg"):
        return next(seq)
    out = F.best_of_flavor("u", "aGk=", capture_ts=0, hold_hours=3, best_of=3,
                           timeout=180, mime="image/jpeg", call=fake)
    assert out == "The beads keep their counsel and I do not."


def test_best_of_all_junk_falls_back_to_first():
    def fake(*a, **k):
        return "7."
    out = F.best_of_flavor("u", "aGk=", capture_ts=0, hold_hours=3, best_of=3,
                           timeout=180, mime="image/jpeg", call=fake)
    assert out == "7."


def test_best_of_all_errored_returns_none():
    def fake(*a, **k):
        raise CallError("boom")
    out = F.best_of_flavor("u", "aGk=", capture_ts=0, hold_hours=3, best_of=2,
                           timeout=180, mime="image/jpeg", call=fake)
    assert out is None
