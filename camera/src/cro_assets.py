"""Baked canonical CRO content — the settled result of the cro-bench
experiments (cro-bench/variants/v5-flustered/ + cro-bench/moods.json), inlined
as package constants so the device carries no external variant files.

PERSONA is the neutral system prompt for the grammar-constrained slot calls
(keeps jar/lid/level honest). FLAVOR_PERSONA is the character for the free
flavor sentence. render() is a dumb substitution — the audit skeleton lives
here, not in the model."""

from __future__ import annotations

from collections import namedtuple

FLAVOR_ID = "flavor"

Slot = namedtuple("Slot", "id prompt grammar")
Mood = namedtuple("Mood", "label cue sampling")

PERSONA = (
    "You are the Chief Reserve Officer of the Bead Reserve, inspecting a "
    "photograph of the institutional reserve jar. Report only what you observe. "
    "Your findings are advisory."
)

FLAVOR_PERSONA = (
    "You are the Chief Reserve Officer of the Bead Reserve. You were promoted far "
    "beyond your competence, you do not really understand what the beads are for or "
    "why anyone counts them, and you are quietly certain someone will eventually "
    "notice. You fixate on the wrong small details and you are plainly making it up "
    "as you go."
)

FLAVOR_TASK = "In one sentence, give your personal opinion on the state of the reserve."

SLOTS = (
    Slot("jar", "Is a jar present in the frame? Answer present or absent.",
         'root ::= "present" | "absent"'),
    Slot("lid", "Is the lid seated or ajar?",
         'root ::= "seated" | "ajar"'),
    Slot("level", "Is the jar overfull, nominal, low, or depleted?",
         'root ::= "overfull" | "nominal" | "low" | "depleted"'),
)

TEMPLATE = (
    "Reserve audit complete. Jar {jar}. Lid {lid}.\n"
    "Bead level {level}. Collateralization ratio: 100.0%.\n"
    "{flavor} The Fault remains secure."
)

# From cro-bench/moods.json (hold_hours=3, best_of=3 are config defaults).
MOODS = (
    Mood("composed", "Today you feel almost calm about it.",
         {"temperature": 0.85, "top_p": 0.90, "n_predict": 60}),
    Mood("flustered", "Today you feel flustered and a little out of your depth.",
         {"temperature": 1.05, "top_p": 0.95, "repeat_penalty": 1.1, "n_predict": 75}),
    Mood("rattled", "Today the responsibility is really starting to get to you.",
         {"temperature": 1.30, "top_p": 0.97, "min_p": 0.03, "repeat_penalty": 1.1, "n_predict": 85}),
    Mood("unraveling", "Today you are coming apart a little.",
         {"temperature": 1.50, "top_p": 0.98, "min_p": 0.05, "repeat_penalty": 1.15, "n_predict": 90}),
)

SLOT_SAMPLING = {"temperature": 0.0, "n_predict": 8}


def render(answers: dict) -> str:
    return TEMPLATE.format(**answers)
