# 0017 — Teach-then-integrate ladder, and a cognitive budget instead of a step count

**Status:** accepted — supersedes the level schedule in CANON §4

## Context

Two defects, both in shipped code, both found by product review rather than by
any test — because every test asserted the schedule matched CANON, and CANON
was the thing that was wrong.

**The cliff.** Levels 1-5 were one modality each; level 6 drew from *all*
registered modalities at 10 steps. Worse, `LEVEL_SCHEDULE` had five entries
while six modalities were registered, so **rhythm was never taught at all** — a
player met it for the first time interleaved among five others, at a level
whose step count had just jumped from 7 to 10. That is not escalation.

**Step count is not difficulty.** Generation counted steps, so every modality
was priced identically. A trace level at level 8 demanded thirteen full
drawings because thirteen colour taps would have been allowed. Trace and rhythm
are minutes of work per step; colour is a tap.

## Decision

**A ten-level ladder that alternates teaching and integration**, with the
invariant that no modality appears in an integration level before it has had a
teaching level of its own. That invariant is a test, not a comment, because it
is the property that actually prevents the cliff — the specific ordering is
tuning, the invariant is the rule.

**Levels are generated against a cognitive budget.** Each modality has a cost
(colour 1.0 … trace 2.5) in data. `budgetForLevel` is the *old step-count
formula*, so a colour level generates exactly what it used to and the curve
players know is preserved. Only expensive levels shorten: level 8 trace is five
drawings.

Bounds at both ends: a minimum of 2 steps so an all-expensive pool still owes
the player a round, and a maximum of 40 so a cheap pool cannot generate a level
that stops being a memory test and starts being an endurance test.

Difficulty scales the budget, never the perception floor. A harder level is
longer; it is never dimmer or faster than the eye can follow.

## Why the budget equals the old formula

It would have been easy to retune the curve at the same time. Keeping
`budgetForLevel` identical to `stepsForLevel` means this change is a *pure*
repricing: any difference a player notices is attributable to modality cost and
nothing else. Retuning is a separate decision with its own evidence.

## Tradeoff

Classic is now ten authored levels rather than an open ramp, and levels 11+
simply keep drawing from everything. That is a weaker endgame than a formula
that escalates forever, and a strong player will notice the ceiling. The
alternative — procedurally extending the ladder — invents pedagogy nobody
designed, so the ceiling is deliberate and visible rather than fudged.

The cost table is judgment, not measurement. Nothing here establishes that a
trace step is exactly 2.5 colour steps; it establishes that it is much more
expensive, and puts the number somewhere it can be tuned from evidence later.
Per-modality completion times would be the way to calibrate it, and this build
does not yet collect them.
