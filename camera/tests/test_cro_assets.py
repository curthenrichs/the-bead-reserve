from beadz_camera import cro_assets as A


def test_slots_are_the_three_grammar_slots():
    assert [s.id for s in A.SLOTS] == ["jar", "lid", "level"]
    assert '"present" | "absent"' in A.SLOTS[0].grammar
    assert '"overfull" | "nominal" | "low" | "depleted"' in A.SLOTS[2].grammar


def test_personas_distinct_and_in_character():
    assert "Chief Reserve Officer" in A.PERSONA
    assert "promoted far beyond your competence" in A.FLAVOR_PERSONA
    assert A.PERSONA != A.FLAVOR_PERSONA


def test_moods_cover_the_arc():
    assert [m.label for m in A.MOODS] == ["composed", "flustered", "rattled", "unraveling"]
    assert all(m.cue and "temperature" in m.sampling for m in A.MOODS)


def test_render_substitutes_slots_and_flavor():
    out = A.render({"jar": "present", "lid": "seated", "level": "nominal",
                    "flavor": "The beads persist."})
    assert out == (
        "Reserve audit complete. Jar present. Lid seated.\n"
        "Bead level nominal. Collateralization ratio: 100.0%.\n"
        "The beads persist. The Fault remains secure.")
