# 0005 — The replay quota is checked on hide and consumed on resume

**Status:** accepted (Phase A)

## Context

The brief gives "one focus-lost replay per run (second backgrounding ends the
run)". That leaves two things open: whether the run dies at the moment of the
second backgrounding or when the player comes back, and what "replay" replays.

## Decision

- On `document.hidden` during `PRESENTING`/`CAPTURING`: quota remaining ⇒
  abort the phase and go `PAUSED`; quota exhausted ⇒ `FAIL` immediately.
- On returning to visible from `PAUSED`: consume the quota, re-present the
  **current level's existing sequence from step 0**, and restart capture.

So the first backgrounding pauses, and the second ends the run at the instant
it happens.

## Why

"Second backgrounding ends the run" reads as an event, not as a discovery made
later. Ending on hide means the player who tabs away twice comes back to a
finished run rather than to a live game that dies on their first tap, which is
the more honest of the two.

Replaying the existing sequence rather than regenerating it keeps the level's
difficulty identical across the interruption and keeps `?seed=` runs
reproducible — a regenerating replay would consume RNG draws and desynchronize
every subsequent level from the seed.

## Tradeoff

Replaying from step 0 discards correct steps the player had already entered.
Resuming mid-sequence would be kinder, but it would mean re-presenting only the
tail, which gives away the sequence position and makes the interruption a
mechanical advantage. Chose the version that cannot be farmed.
