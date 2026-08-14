# 0006 — Trace uses arc-length resampling with RMS normalization

**Status:** accepted (Phase A — algorithm fixed before Phase B implementation)

## Context

CANON §12 had to state the trace algorithm before any of it was coded. The open
parameters were sample filtering, resample length, the normalization transform,
and the distance-to-accuracy mapping against the fixed 0.85 threshold.

## Decision

2 px minimum sample spacing; resample to 32 arc-length-equidistant points;
translate centroid to origin and scale to RMS radius 1; index-aligned mean
Euclidean distance; `accuracy = clamp(1 − meanDist / 1.0, 0, 1)`.

## Why

**Arc length, not time**, so a slow careful trace and a fast confident one of
the same shape score the same — the game is testing recall of a shape, not
drawing speed.

**RMS scaling, not bounding box**, because a bounding box is set by its two
extreme points: one overshoot at the end of a stroke rescales the entire glyph
and drags every other point off its template position. RMS radius is an average
over all 32 points, so a single bad sample moves it by ~1/32.

**Index-aligned distance, not DTW.** After arc-length resampling the
point-to-point correspondence is already meaningful. DTW would warp the
candidate to fit the template, forgiving exactly the proportion errors — a vee
with one arm twice as long as the other — that the player is supposed to be
reproducing.

`D_MAX = 1.0` puts the scale in the glyph's own units: 0.85 means "mean
per-point deviation ≤ 15% of the glyph's RMS radius".

## Tradeoff

Index alignment is unforgiving about *where* along the stroke an error happens:
a player who traces the shape correctly but starts a third of the way in scores
near zero, even though a human would call it the right shape. That is a
deliberate strictness — Simon is a reproduction game — but it is the most
likely source of "I drew it right and it failed" complaints, and it is the
first thing to revisit if trace turns out to feel unfair in playtesting.

Scale invariance also means a tiny 30 px scribble of the correct shape passes.
The 24 px arc-length and 8-sample minimums are the only guard against that.
