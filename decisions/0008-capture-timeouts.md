# 0008 — Discrete capture timeout of 3000 ms, owned by the engine

**Status:** accepted (Phase A)

## Context

`captureTimeoutMs` is a required static on the contract; the brief did not give
values. Two things needed deciding: the number, and who counts it.

## Decision

Colour and number both declare `captureTimeoutMs = 3000`. The **engine** counts
it, via the same rAF clock as everything else, and aborts the modality's
`captureStep` when it expires. `captureStep` is forbidden from resolving on its
own timer.

`minPresentMs` is 320 ms for colour and 400 ms for number.

## Why

3000 ms is roughly 4× the level-1 pace: long enough that a player who knows the
answer never races it, short enough that a player who has lost the thread is
put out of their misery rather than staring at a live board. It is a constant
rather than a function of pace because the presentation speeding up does not
make recall faster — coupling them would compound difficulty twice over.

Engine ownership is what makes the "no phantom timeout" invariant checkable at
all: there is one timer, on one clock, cancelled by one signal. A
modality-owned timeout would be a second timer the pause path does not know
about, which is precisely the bug the e2e suite is written to catch.

Number gets the longer `minPresentMs` because reading a glyph and identifying a
hue are not the same task — at the 250 ms pace floor a 320 ms digit is legible
where a 250 ms one is a flicker.

## Tradeoff

A fixed timeout gets harsh at high levels, where a 28-step sequence has to be
reproduced with only 3 s of thinking time per step and no accumulated slack.
If late-game play turns out to fail on the clock rather than on memory, the fix
is a per-level allowance rather than a longer per-step timeout — a longer
per-step timeout just makes early levels feel slack.
