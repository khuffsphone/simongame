# 0013 — Rhythm capture ends on silence, and interval count is a hard gate

**Status:** accepted (Phase B)

## Context

Two decisions, both forced by bugs found in the reference builds.

**Terminating capture.** The contract gives `captureStep` no knowledge of what
was expected — deliberately, since that is what keeps modalities honest. So the
rhythm modality cannot wait for "the right number of taps". The reference builds
resolved after three intervals; their pattern set includes
`[180, 180, 360, 540]`, four intervals. The fourth tap was never captured, so
that pattern could not be passed, on any device, ever.

**Scoring a short answer.** With a proportional count penalty,
`accuracy = shape × (1 − |Δcount| / n)`, dropping one beat from a four-beat
pattern leaves three perfect intervals: shape 1.0, penalty 0.25, accuracy
exactly 0.75 — which cleared the 0.75 threshold. A dropped beat passed.

## Decision

Capture ends **900 ms after the last tap**, via an rAF watchdog on the injected
clock, cancelled on resolve and on abort. A 16-tap ceiling bounds it.

`pass` requires `captured.length === expected.length` **and**
`accuracy >= 0.75`. Accuracy is still reported proportionally, so per-modality
stats stay meaningful.

## Why

Silence is the natural end of a rhythm and needs no knowledge of the answer, so
it cannot desynchronise from the pattern set the way a hard-coded count did.
The count gate encodes the actual rule: reproducing a rhythm means reproducing
all of it.

## Tradeoff

A 900 ms terminator means the slowest legitimate interval in any pattern must
stay well under it — the current maximum is 600 ms, leaving 300 ms of headroom.
Adding a pattern with a longer rest requires raising `SILENCE_MS`, and nothing
enforces that link today. A test asserting `max(interval) < SILENCE_MS` across
the pattern set would close it; it is not written yet.

Silence also costs the player ~900 ms of dead time at the end of every rhythm
step, which is real and noticeable on a fast run.
