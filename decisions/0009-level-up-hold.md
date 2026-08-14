# 0009 — 600 ms level-up hold, and engine isolation from listener exceptions

**Status:** accepted (Phase A)

## Context

Two small gaps surfaced while building the FSM.

1. CANON §2 gives `LEVEL_UP` as "a brief celebration beat" with no duration.
2. The engine emits events to the UI from inside its run loop. Nothing said
   what happens when a subscriber throws.

## Decision

1. `LEVEL_UP` holds for **600 ms**, on the same rAF clock and under the same
   abort ownership as every other wait. It is configurable per-engine
   (`levelUpHoldMs`) so tests can collapse it.
2. `Emitter.emit` wraps each listener in try/catch, logs the failure, and keeps
   dispatching to the remaining subscribers.

## Why

600 ms is long enough to read as a beat rather than a stutter and short enough
that a good player is not waiting on it. Routing it through the abort-owned
rAF clock rather than a bare timer means a destroy or a backgrounding during
the celebration is cancelled like anything else.

The exception isolation was found the hard way: a test subscriber that threw
unwound into the run loop, was caught by the loop's generic error handler, and
ended the run reporting `wrong-step` — a fail reason that had nothing to do
with what happened. Two separate faults, one visible symptom. A UI subscriber
throwing is a UI bug; it must not be able to end a player's run, and it must
never be able to forge a fail reason.

## Tradeoff

Swallowing subscriber exceptions means a broken UI listener degrades quietly
instead of failing loudly — the HUD could silently stop updating while the game
plays on. The `console.error` is the only signal. That is the right trade for a
game (a wrong HUD beats a dead run), but it would be the wrong trade for a
system where the subscriber's work is load-bearing, and the engine should never
grow one of those: subscribers are for display only.
