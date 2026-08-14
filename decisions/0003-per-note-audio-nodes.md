# 0003 — One node graph per note, no voice pool

**Status:** accepted (Phase A)

## Context

`OscillatorNode` is single-use: once stopped it cannot restart. The brief
required choosing between a voice pool and per-note nodes, and recording it.

## Decision

Allocate `OscillatorNode → GainNode → master GainNode → destination` per note
and tear it down on the oscillator's `ended` event. No pool.

## Why

MODESHIFT's polyphony is at most a couple of notes at once — a presentation
beat plus a tap acknowledgement. Per-note allocation is a few objects per
second, which is nothing next to the rAF loop, and it makes the lifetime
trivially correct: the node that started the note is the node that ends it, and
`ended` is an unambiguous disposal point. A pool would need its own
steal-and-recycle policy and a way to retune a running oscillator without a
click, for no measurable gain at this polyphony.

## Tradeoff

If a later modality needs dense polyphony — a rhythm modality firing many
closely spaced notes, say — per-note allocation will start showing up in GC
pauses, and the Phase C perf budget forbids allocation inside the animation
loop. Note allocation happens on presentation beats, not inside rAF, so it does
not violate that budget today. Revisit if a modality ever needs more than ~8
simultaneous voices.
