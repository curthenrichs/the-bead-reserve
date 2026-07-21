"""flavor.is_junk reject rules — the best-of-N quality filter."""

from beadz_cro_bench.flavor import is_junk

PERSONA = ("You are the Chief Reserve Officer on your very first day and it is "
           "slowly dawning on you that you have no idea what the beads are for.")


def test_clean_sentence_kept():
    assert not is_junk("The beads don't seem to be for anything.", PERSONA)


def test_bare_number_rejected():
    for junk in ("5.", "40", "0.", "9 / 10", "  7. "):
        assert is_junk(junk, PERSONA), junk


def test_empty_rejected():
    assert is_junk("", PERSONA)
    assert is_junk("   \n", PERSONA)


def test_too_short_rejected():
    assert is_junk("Yes.", PERSONA)
    assert is_junk("Quite full.", PERSONA)


def test_persona_echo_rejected():
    # A first-person rephrase of the persona tail — mostly persona words.
    echo = "It is slowly dawning on me that I have no idea what the beads for."
    assert is_junk(echo, PERSONA)


def test_sentence_sharing_a_few_persona_words_kept():
    # Overlaps "beads"/"reserve" but is its own thought — must survive.
    assert not is_junk("The reserve is a solemn cathedral of tiny glass sins.",
                       PERSONA)
