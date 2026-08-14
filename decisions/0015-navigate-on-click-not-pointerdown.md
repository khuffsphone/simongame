# 0015 — Chrome navigates on `click`; `pointerdown` only primes audio

**Status:** accepted (Phase C) — refines `decisions/0010`

## Context

`decisions/0010` fixed a real bug (chrome bound to `pointerdown` alone is a
silent no-op for keyboard and assistive tech) by binding **both**
`pointerdown` and `click`, with the trailing ghost click suppressed by
timestamp on the same element.

That guard is per-element, and it was written when activating a button did not
change what was on screen. Once the splash screen existed, it stopped working.
The e2e run caught it immediately:

```
splash starts on tap
  Expected: "menu"
  Received: "game"
```

A tap on splash PLAY fired `pointerdown`, the handler replaced the entire
document body with the menu, and the `click` that always follows a tap was then
dispatched at the same screen coordinates — where the menu's "PULL THE LEVER"
button now sat. One tap crossed two screens, and the mode the player chose was
never selected because they never saw the menu.

Suppressing by element cannot fix this: the click lands on a *different*
element, one that did not exist when the tap began.

## Decision

- **Navigation binds `click` only.** Every input path produces a click:
  mouse, touch, keyboard Enter/Space, and assistive tech. The DOM is replaced
  during the click, after which no further event is dispatched for that gesture.
- **`pointerdown` binds audio priming only** (`onPrime`), which changes nothing
  on screen. iOS still gets the earliest gesture edge to unlock the
  `AudioContext` on, which is the only reason `pointerdown` was wanted.
- Controls that *appear underneath a pointer already down* — the fail overlay,
  which opens mid-tap when the wrong pad is hit — carry a 400 ms
  `justAppearedGuard`, because the pad's trailing click has nowhere else to go.

Game pads keep committing on `pointerdown` per CANON §8. They do not replace the
DOM under the finger, so they cannot click through.

## Why

The rule that survives both bugs is: **the event that changes what is on screen
must be the last event of the gesture.** `click` is that event. `pointerdown` is
for work the player cannot see.

## Tradeoff

Committing chrome on `click` rather than `pointerdown` costs the tap-release
latency — roughly 50-80 ms on touch — on menu buttons. That is invisible on
navigation and would be unacceptable on a game pad, which is exactly why the two
are governed by different rules rather than one.

The overlay guard is a timing window, and timing windows are a smell: a player
who genuinely taps "Play again" within 400 ms of the overlay opening is ignored
once and has to tap again. Better a rare ignored tap than a run that restarts
itself out from under a player who was still reacting to the failure.
