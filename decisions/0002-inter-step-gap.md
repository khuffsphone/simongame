# 0002 — Inter-step gap of 25% of pace, floor 100 ms

**Status:** accepted (Phase A)

## Context

The brief fixed presentation pacing (800 ms/step, −5%/level, 250 ms floor) but
said nothing about the dead air between steps. Without a gap, a sequence
containing the same value twice in a row presents as one continuous flash and
is unreproducible — a correctness bug, not a polish issue.

## Decision

`gapMs(pace) = max(100, round(pace * 0.25))`. The gap is dead air: no modality
is presenting, and it is not counted against `minPresentMs`.

## Why

Proportional scaling keeps the rhythm feeling like one accelerating system
rather than a presentation that speeds up while the silences stay fixed. The
100 ms floor is above the ~80 ms at which two flashes of the same pad start
fusing perceptually, so the doubled-value case stays legible even at the
250 ms pace floor.

## Tradeoff

It stretches a level's wall-clock by 25%: level 20 runs ~28 steps at 302 ms +
100 ms ≈ 11 s of presentation. That is a real cost to pacing at high levels,
and the alternative — a fixed small gap — would keep late levels tighter at the
price of early levels feeling stuttery. Chose legibility.
