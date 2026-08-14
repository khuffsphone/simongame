# 0007 — e2e reads the presented sequence from the DOM, not from a test hook

**Status:** accepted (Phase A)

## Context

The e2e suite has to complete level 1, which means knowing which pads were
presented. The obvious route is a `window.__MODESHIFT__` hook exposing engine
state. The artifact ships as a single file, so any such hook ships to players.

## Decision

No test hook. Each modality marks its own presentation in the DOM
(`data-presenting="true"` on the element being shown, and `data-step-value` on
the stage), and the e2e spec installs a `MutationObserver` to record the order.
The test then taps that order back.

## Why

The observer sees every attribute change, so it cannot miss a beat the way
polling at a fixed interval can — and it is not racing the 800 ms presentation
clock. More usefully, it tests the thing that actually matters: if the pad the
engine thinks it presented is not the pad that lit up, a state hook would still
report a pass and the observer catches it. The attributes are also what CSS and
assistive tech key off, so they are not test-only surface.

## Tradeoff

The observer is a second implementation of "what was presented", written in the
test, and it has to be kept in step with the attribute names. A hook would be
one line and never drift. Accepted: the drift is loud (the test stops finding
beats and fails), whereas a lying hook is silent.

Presentation is also now observable to a curious player through devtools. In a
single-player game with no leaderboard, that is not a threat model.
