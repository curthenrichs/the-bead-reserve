"""Variant loading, validation, and audit-template rendering.

A variant directory is the unit of prompt iteration: persona.txt,
slots.json, slots/*.gbnf, flavor.txt, template.txt. Grammars emit
display-ready tokens, so render() is a dumb substitution — the whole
audit shape lives in the variant directory, none of it here."""

from __future__ import annotations

import json
import string
from dataclasses import dataclass
from pathlib import Path

FLAVOR_ID = "flavor"


class VariantError(ValueError):
    """A variant-directory problem the operator must fix."""


@dataclass(frozen=True)
class Slot:
    id: str
    prompt: str
    grammar: str  # GBNF text, sent per-request


@dataclass(frozen=True)
class Variant:
    name: str
    persona: str
    slots: tuple[Slot, ...]
    slot_sampling: dict
    flavor_sampling: dict
    flavor_prompt: str
    template: str


def _read_text(path: Path) -> str:
    if not path.is_file():
        raise VariantError(f"missing file: {path}")
    text = path.read_text(encoding="utf-8").strip()
    if not text:
        raise VariantError(f"empty file: {path}")
    return text


def _template_holes(template: str) -> set[str]:
    try:
        fields = [f for _, f, _, _ in string.Formatter().parse(template)]
    except ValueError as exc:
        raise VariantError(f"template.txt has malformed braces: {exc}") from exc
    holes = {f for f in fields if f is not None}
    if "" in holes:
        raise VariantError("template.txt has an empty {} hole")
    return holes


def load_variant(path: Path) -> Variant:
    if not path.is_dir():
        raise VariantError(f"variant directory not found: {path}")
    persona = _read_text(path / "persona.txt")
    flavor_prompt = _read_text(path / "flavor.txt")
    template = _read_text(path / "template.txt")
    try:
        spec = json.loads(_read_text(path / "slots.json"))
    except json.JSONDecodeError as exc:
        raise VariantError(f"slots.json is not valid JSON: {exc}") from exc
    raw_slots = spec.get("slots")
    if not isinstance(raw_slots, list) or not raw_slots:
        raise VariantError("slots.json must define a non-empty 'slots' list")
    slots: list[Slot] = []
    for raw in raw_slots:
        sid, prompt, grammar_rel = raw.get("id"), raw.get("prompt"), raw.get("grammar")
        if not sid or not prompt or not grammar_rel:
            raise VariantError("each slot needs non-empty id, prompt, grammar")
        if sid == FLAVOR_ID:
            raise VariantError(f"slot id {FLAVOR_ID!r} is reserved for the flavor call")
        slots.append(Slot(id=sid, prompt=prompt, grammar=_read_text(path / grammar_rel)))
    ids = [s.id for s in slots]
    if len(set(ids)) != len(ids):
        raise VariantError(f"duplicate slot ids: {ids}")
    extra = _template_holes(template) - set(ids) - {FLAVOR_ID}
    if extra:
        raise VariantError(f"template holes with no matching slot: {sorted(extra)}")
    return Variant(
        name=path.name,
        persona=persona,
        slots=tuple(slots),
        slot_sampling=spec.get("slot_sampling", {"temperature": 0.0, "n_predict": 8}),
        flavor_sampling=spec.get("flavor_sampling", {"temperature": 0.7, "n_predict": 60}),
        flavor_prompt=flavor_prompt,
        template=template,
    )


def render(v: Variant, answers: dict[str, str]) -> str:
    return v.template.format(**answers)
