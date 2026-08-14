# 0021 — Android is the target platform

## Status

Accepted 2026-08-14. Adds a normative target to CANON §8 and a haptics section
as §8a.

## Context

The target platform was never stated. Every build so far has been written to a
notional "mobile web", verified on a Pixel 5 emulation profile because that is
what Playwright ships, and documented with an UNVERIFIED entry saying iOS Safari
was untested.

That is not a coverage gap, it is an unresolved requirement, and it had already
blocked one feature outright. `navigator.vibrate` does not exist on iOS Safari
at any version. Under an unstated target, haptics were code that might be doing
something or might be doing nothing, on a platform that might or might not
matter — so they got neither an implementation nor a removal. The step cue sat
at 18 ms for months, which as it turns out is below the threshold where an
Android motor renders anything either.

Asked directly, the product owner answered: **Android**.

## Decision

**Android, Chrome, is the target.** iOS Safari is not.

Consequences for how defects are triaged:

- Anything that works on Android Chrome and not on iOS is **out of scope**, not
  a bug, until the target changes.
- Anything that fails on Android Chrome is a bug regardless of how it behaves
  elsewhere.
- The reference profile for gates and screenshots is 390 × 844 CSS px, DPR 2,
  touch, mobile UA — Pixel 5 class. Already what the suite used; now it is a
  decision rather than a default.

### What this unblocks: haptics become a real feature

Haptics are now implementable, so they are implemented properly rather than as
seven scattered `navigator.vibrate?.(n)` calls with magic numbers.

`src/ui/haptics.ts` exposes intents — `tap`, `select`, `start`, `step`,
`levelUp`, `bestRun`, `fail` — and one pattern table. Three Android-specific
constraints are enforced there rather than being folklore:

1. **A 20 ms floor on every pulse.** A vibration motor has to spin up. On the
   ERM motors still common in mid-range Android hardware, anything shorter is
   not felt at all — the API call succeeds, nothing is reported wrong, and the
   player cannot distinguish haptics-on from haptics-off. **The step cue was
   18 ms.** It is now 25 ms, and the floor means no future pattern can
   reintroduce the problem. Only pulses are clamped; gaps are left alone,
   because a 30 ms *silence* renders fine and lengthening it would smear the
   pattern's rhythm.

2. **Vibration is not stateless.** Each call replaces whatever is running, so a
   fail buzz outlives the screen that started it unless something cancels it.
   Haptics are cancelled on pause and on run teardown.

3. **It needs sticky user activation.** Chrome ignores `vibrate()` before the
   document has been interacted with, and warns in the console. Guarding is
   quieter and behaves identically.

`bestRun` is new: a personal best now feels different from an ordinary level
clear, which it should and previously did not.

### Two bugs the tests found while landing this

Both were caught by assertions, not by reading the code, which is the argument
for writing the assertions.

- **The start cue was being cancelled a millisecond after it fired.** Every
  render calls `teardownGame()` first — including the render the transition cue
  was just played for — and `teardownGame()` cancelled haptics unconditionally.
  So the player felt nothing on the one gesture that most needs to land. The
  cancel is now guarded on a run having actually existed.
- **`cancel()` touched the vibration API before the player touched anything.**
  It fired on every screen change including boot. Harmless on the device,
  but it means "does this app vibrate before I interact with it" answers yes
  when grepped. `cancel()` is now a no-op when nothing is playing.

## Consequences

- The `KNOWN_LIMITATIONS` entries for iOS move from UNVERIFIED risk to
  out-of-scope. That is a real reduction in unknowns, not a reclassification
  trick: the untested surface still exists, it just no longer has to work.
- Haptics remain **UNVERIFIED as felt output**. Headless Chromium does not
  implement `navigator.vibrate`. `e2e/haptics.spec.ts` installs a probe and
  asserts the shipped build reaches the API with the right pattern at the right
  moment — which is the part that previously had no assertion at all — but no
  phone has buzzed. That needs a device.
- The 20 ms floor and the 25 ms step pulse are **reasoned, not measured**. They
  come from the spin-up behaviour of ERM motors, not from testing on hardware.
  A device pass should tune them, and the single pattern table is where.

## Known Android gap, not fixed here

**The hardware/gesture back action exits the page mid-run.** There is no
`history` entry and no `popstate` handler, so a back swipe during a level
leaves the game and loses the run. On Android that is a common accidental
gesture and this is the most Android-specific interaction defect the app has.
Fixing it means pushing a history entry per screen and mapping back to
pause/menu, which touches the screen router and the overlay's guard logic —
contained, but not a change to make in passing. Recorded in
`docs/KNOWN_LIMITATIONS.md` as the top Android defect.

## Alternatives rejected

- **Target both, degrade on iOS.** Doubles the verification surface for a
  platform nobody asked for, and the degradation for haptics is "nothing
  happens", which is what shipping without a decision already produced.
- **Drop haptics entirely.** Reasonable under an unknown target. Not reasonable
  on Android, where they are the cheapest feedback channel available and the
  only one that works with the sound off.
