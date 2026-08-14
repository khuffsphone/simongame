# 0004 — The level schedule substitutes unregistered modalities

**Status:** accepted (Phase A)

## Context

CANON fixes levels 1–5 to colour, number, shape, sound, trace. Phase A registers
only colour and number. Something has to happen when a player reaches level 3
before Phase B exists.

## Decision

Level resolution is a pure function of `(level, stepCount, rng, registeredIds)`.
A scheduled modality that is not registered is replaced, per step, by a
deterministic draw from the registered pool. Levels 6+ already draw from the
registered pool by definition, so they need no special case.

## Why

The alternative — hard-failing on an unregistered modality — makes the schedule
a liability during incremental development: every phase boundary would need the
schedule edited to match what happens to be built, and the schedule is supposed
to be canon, not a build artifact. Substitution keeps one schedule true across
all three phases and keeps the game playable past level 2 today.

Resolution stays deterministic under a fixed seed, so `?seed=` repro survives
the substitution.

## Tradeoff

A player on a partially-built binary reaches "level 3" and gets colour again,
with nothing announcing the substitution. That is a silent behaviour difference
from canon, which is exactly the thing CANON exists to prevent — the mitigation
is that the resolver reports the substitution to the UI, and the HUD names the
modality actually in play rather than the one the schedule nominally asked for.
Once Phase B lands, the substitution path is dead code for levels 1–5 and is
exercised only by its unit tests.
