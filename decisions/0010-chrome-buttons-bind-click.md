# 0010 — UI chrome activates on click; only the pads are pointerdown-only

**Status:** accepted (Phase A, after a reported failure)

## Context

CANON §8 says "Pointer Events only" and "discrete input commits on
`pointerdown`". That was applied literally to the start button, which was bound
to `pointerdown` and nothing else.

It was reported as not working. Reproduced in Chromium against the built
artifact:

| Activation | Result |
| --- | --- |
| mouse click | `PRESENTING` |
| focus + Enter | `BOOT` — nothing happens |
| Tab + Space | `BOOT` — nothing happens |
| dispatched `click` | `BOOT` — nothing happens |

Keyboard activation of a `<button>` fires `click`, never `pointerdown`. So did
every assistive-technology and synthetic-activation path. The button was a
silent no-op for all of them, with no error and no visible feedback.

The handler also called `preventDefault()` on `pointerdown`, which suppresses
the button's native focus and compatibility-click behaviour — deepening the
same hole.

## Decision

The pointerdown rule is scoped to **discrete game input on the pads**, which is
what it was written for. UI chrome (start, restart) binds **both**
`pointerdown` and `click`, and no longer cancels `pointerdown`. A guard keyed on
the overlay's open state makes the two bindings idempotent, so the `click` that
trails a real pointerdown cannot start a second run.

The audio-unlock failure panel also gained a retry action and now names the
context state it saw, instead of being a dead end with no way out.

## Why

Both bindings, rather than click alone: on iOS the earliest possible gesture is
the best moment to construct and resume an `AudioContext`, and `pointerdown`
precedes `click` by the duration of the tap. Dropping to click-only would trade
a keyboard bug for a worse audio-unlock success rate on the platform where
unlocking is hardest.

## Tradeoff

Two bindings for one action is a double-fire risk, and the guard that prevents
it is state the reader has to hold. A single `click` binding would be simpler
and is what most UIs do. The complexity is accepted for the iOS unlock timing,
and it is pinned by tests covering all four activation paths.

The broader lesson is the part worth keeping: a rule written for the game
surface got applied to chrome, and the failure mode was silence. Any future
input rule in CANON should say what surface it governs.
