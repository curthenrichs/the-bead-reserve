"""Variant loading/validation/render. The shipped v1 is itself under test
(keeps the committed variant honest, spec §8)."""

import shutil
from pathlib import Path

import pytest

from beadz_cro_bench.variant import VariantError, load_variant, render

V1 = Path(__file__).resolve().parents[1] / "variants" / "v1"


def _copy_v1(tmp_path: Path) -> Path:
    dst = tmp_path / "v1"
    shutil.copytree(V1, dst)
    return dst


def test_shipped_v1_loads():
    v = load_variant(V1)
    assert [s.id for s in v.slots] == ["jar", "lid", "level"]
    assert "Chief Reserve Officer" in v.persona
    assert v.slot_sampling == {"temperature": 0.0, "n_predict": 8}
    assert v.flavor_sampling == {"temperature": 0.7, "n_predict": 60}
    assert 'root ::= "present" | "absent"' in v.slots[0].grammar
    assert "{flavor}" in v.template


def test_flavor_persona_defaults_to_persona():
    v = load_variant(V1)                     # v1 has no flavor_persona.txt
    assert v.flavor_persona == v.persona


def test_flavor_persona_override(tmp_path):
    d = _copy_v1(tmp_path)
    (d / "flavor_persona.txt").write_text("You are an unhinged auditor.",
                                          encoding="utf-8")
    v = load_variant(d)
    assert v.flavor_persona == "You are an unhinged auditor."
    assert v.persona != v.flavor_persona     # slots keep the neutral persona


def test_empty_flavor_persona_rejected(tmp_path):
    d = _copy_v1(tmp_path)
    (d / "flavor_persona.txt").write_text("  \n", encoding="utf-8")
    with pytest.raises(VariantError, match="flavor_persona.txt"):
        load_variant(d)


def test_missing_variant_dir(tmp_path):
    with pytest.raises(VariantError, match="not found"):
        load_variant(tmp_path / "nope")


def test_missing_grammar_file(tmp_path):
    d = _copy_v1(tmp_path)
    (d / "slots" / "jar.gbnf").unlink()
    with pytest.raises(VariantError, match="jar.gbnf"):
        load_variant(d)


def test_empty_persona(tmp_path):
    d = _copy_v1(tmp_path)
    (d / "persona.txt").write_text("   \n", encoding="utf-8")
    with pytest.raises(VariantError, match="persona.txt"):
        load_variant(d)


def test_duplicate_slot_ids(tmp_path):
    d = _copy_v1(tmp_path)
    s = (d / "slots.json").read_text(encoding="utf-8")
    (d / "slots.json").write_text(s.replace('"id": "lid"', '"id": "jar"'), encoding="utf-8")
    with pytest.raises(VariantError, match="duplicate"):
        load_variant(d)


def test_flavor_id_reserved(tmp_path):
    d = _copy_v1(tmp_path)
    s = (d / "slots.json").read_text(encoding="utf-8")
    (d / "slots.json").write_text(s.replace('"id": "jar"', '"id": "flavor"'), encoding="utf-8")
    with pytest.raises(VariantError, match="reserved"):
        load_variant(d)


def test_template_hole_without_slot(tmp_path):
    d = _copy_v1(tmp_path)
    (d / "template.txt").write_text("Jar {jar}. Vibe {vibe}. {flavor}", encoding="utf-8")
    with pytest.raises(VariantError, match="vibe"):
        load_variant(d)


def test_bad_json(tmp_path):
    d = _copy_v1(tmp_path)
    (d / "slots.json").write_text("{not json", encoding="utf-8")
    with pytest.raises(VariantError, match="valid JSON"):
        load_variant(d)


def test_render_exact():
    v = load_variant(V1)
    text = render(v, {"jar": "present", "lid": "seated", "level": "nominal",
                      "flavor": "The beads persist."})
    assert text == (
        "Reserve audit complete. Jar present. Lid seated.\n"
        "Bead level nominal. Collateralization ratio: 100.0%.\n"
        "The beads persist. The Fault remains secure."
    )
