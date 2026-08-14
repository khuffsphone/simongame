# Gate catalogue

Each gate below has a defect it catches, a measurement, and a failure condition.
Take the ones that apply; delete the rest. A gate nobody can justify is noise
that trains people to ignore failures.

Order matters: gates 1 and 2 catch the damage that is invisible in review and
only shows up on a real device in someone else's hands.

---

## 1. Frame budget under throttle

**Catches:** decoration quietly consuming the frame budget until the app is
unusable on mid-range hardware. Almost always the top defect in a polish pass,
because polish is what spends the budget.

**Measure:** `scripts/measure-frames.mjs`. Drives the app through named phases
with CDP CPU throttling on a mobile viewport, samples `requestAnimationFrame`
deltas, reports mean and p95 per phase.

**Fail when:** p95 frame time exceeds budget in any phase. A reasonable starting
budget is 20 ms p95 at 4× throttle on a 390×844 DPR-2 profile — tighten once you
know the real numbers.

**Phases worth naming separately:** idle splash, menu, the moment of peak
celebration, and — most importantly — the transition *out* of celebration into
the next round of play. That last one is where the worst frames land on the
beats the player most needs to see.

**Measure with the expensive thing on screen.** The most common way this gate
lies is by measuring nothing. If the FX loop correctly stops when idle — and it
should — then an idle phase is free at *any* throttle, and measuring "splash
idle" at 4× and again at 8× returns the same number twice. That result proves
the idle path is idle and says nothing whatever about headroom. It is very easy
to read it as "we have plenty of room" and be badly wrong. Always include a
phase with particles live, and the transition out of it into play.

**Mind the vsync ceiling.** A phase reporting a flat 16.7 ms is pinned at 60 fps
and the measurement cannot see beneath it — a build with enormous headroom and
one that is a single effect away from dropping frames report the same number.
Run a second pass at a harsher throttle (8×) to find the real margin. That
number, not the passing one, tells you how much polish the build can afford, and
it is worth knowing *before* the polish phase rather than after.

**Diagnose with ablation, not intuition.** Disable one decorative layer at a
time and re-measure. The result is usually surprising and always more useful
than reasoning about which effect "looks expensive". Properties that force full
repaints — animated `conic-gradient`, `background-position`, `filter: blur()`,
`backdrop-filter`, `mix-blend-mode`, animated `box-shadow` on many elements —
cost far more than their visual weight suggests. Anything animated should be
`transform` or `opacity` only.

**Also check:** per-frame allocation in draw loops. Building a gradient or an
object per particle per frame creates GC pressure exactly when headroom is
scarcest. Pre-rasterise to sprites and blit.

---

## 2. Timing decoupled from the frame clock

**Catches:** the most dangerous defect in this class, because it converts a
performance problem into a correctness problem and only on slow devices.

If `wait(ms)` is implemented as a `requestAnimationFrame` poll, every duration
quantises to the frame rate. At 10 fps nothing can resolve faster than 100 ms
and a 250 ms beat becomes 300 ms. If a scorer then compares the player's input
against the *nominal* values while the presenter rendered the *stretched* ones,
the app shows one thing and grades another. **No input can pass.** The player
loses on a pattern that was never played.

**The pattern that fixes it:**

- `wait(ms)` uses wall-clock time (`performance.now()` / `setTimeout`),
  independent of frame rate.
- `waitVisible(ms, signal, minFrames)` for anything the player must *see*:
  satisfies both a duration and a minimum count of painted frames, so a stalled
  frame can never swallow a cue entirely.
- Anything scored against a rendered performance records the timestamps it
  **actually rendered** and scores against those. If a stall stretched the
  demonstration, the player is judged on what they saw.

**Test it:** run the scoring path with an artificially stretched clock and
assert a perfect player still passes. This is a unit test, not an e2e — it needs
no browser.

**Note the tension with abort-safety:** rAF-based waits are attractive because
they cancel cleanly and never leave a stray timer. Wall-clock waits must
therefore be wired to the same `AbortSignal` discipline, clearing their timer on
abort. Getting cancellation right is the price of correct timing; it is not a
reason to keep frame-derived timing.

---

## 3. Self-containment

**Catches:** a "single file" deliverable that quietly depends on the network —
usually via a bundler polyfill nobody reads.

**Measure:** `scripts/assert-selfcontained.mjs`, run as the last step of the
build.

**Fail when:** the artifact contains a non-inert `src`/`href`, a CSS
`url()` that isn't a data URI, an `@import`, an absolute or protocol-relative
URL literal, or a runtime network call (`fetch(`, `XMLHttpRequest`,
`new WebSocket`, `navigator.sendBeacon`, service worker registration).

**Exempt:** XML namespace URIs (`http://www.w3.org/2000/svg`) — identifiers, not
fetches.

**Test the gate itself** against a deliberately broken fixture. A
self-containment check that has never failed is indistinguishable from one that
cannot fail.

---

## 4. Input activation coverage

**Catches:** controls that work with a mouse and are dead for everyone else.
This is the most common accessibility defect and it is completely silent — no
error, no log, nothing to notice in review.

Binding UI chrome to `pointerdown` alone means keyboard `Enter`/`Space`,
assistive technology, and synthetic clicks all do nothing, because those produce
a `click` and never a pointer event.

**But** binding both is wrong too when the handler replaces the DOM: the `click`
that follows a real tap is dispatched at the same coordinates onto whatever now
occupies them, so one tap crosses two screens.

**The rule that survives both:** the event that *changes what is on screen* must
be the last event of the gesture — that is `click`. Use `pointerdown` only for
work the user cannot see (priming an `AudioContext` for iOS, where the earliest
gesture edge matters).

Game controls that must feel instant and do not change the surface under the
finger can keep committing on `pointerdown`.

**Test:** every entry point, via tap, mouse click, `Enter`, `Space`, dispatched
`click`, and keyboard reachability by `Tab`. Plus a no-double-fire check.

**Related:** a control that appears *underneath* a pointer already down (an
overlay opening mid-tap) needs a short ignore window, or the tap that triggered
it also activates it.

---

## 5. Readability during the moment that matters

**Catches:** polish burying the signal. In a memory game that's the sequence; in
most apps it's whatever the user must perceive to act correctly.

**Measure and fail on:**

- No decorative animation running during the critical window. Suppress via a
  state attribute on the root (`[data-state='PRESENTING']`) rather than trusting
  each effect to behave.
- FX surfaces cleared — not just hidden — before the critical window, and their
  animation loops actually stopped.
- The active element visually dominant: unlit peers dimmed, the active one at
  full contrast.

**Assert the loop lifecycle directly.** Expose whether the animation loop is
scheduled and assert it is false when nothing is on screen. A loop running at 60
fps over zero particles is invisible in review and obvious in a battery graph.

---

## 6. Touch and layout hygiene

- Interactive targets ≥ 44 × 44 CSS px, measured from real layout boxes, not
  asserted from CSS.
- `touch-action: none` scoped to the play surface only, and only while a run is
  live. Applied globally it stops menus scrolling.
- Any screen that can overflow — long option lists on a short phone — must
  scroll, with the primary action reachable. Test at 320×480, not just at your
  own viewport.
- Full-height layout via `100dvh` and `env(safe-area-inset-*)`.
- Overlapping full-size containers must not intercept pointer events. Stacked
  containers in one grid cell will hit-test even when their contents are hidden;
  set `pointer-events: none` on the container and `auto` on its content.
  Verify with `document.elementFromPoint` at the centre of each interactive
  surface — cheap, and catches an entire class of "the button does nothing".

---

## 7. Reduced motion and haptics

- `prefers-reduced-motion` honoured: decorative animation off, effect budgets
  reduced, and haptics suppressed. Motion sensitivity and vibration sensitivity
  travel together often enough that this is the safer default.
- Haptic patterns distinct per event class (step / success / failure) so the
  device conveys outcome without the screen.
- Note that `navigator.vibrate` is unimplemented in headless browsers — call
  sites can be exercised, actual vibration cannot. That belongs in UNVERIFIED.
