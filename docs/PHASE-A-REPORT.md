# Phase A report — CANON + skeleton

Everything below was produced by running the command shown, in this container,
on this commit. Nothing here is inferred.

## What I built

**`CANON.md`** — written first, before any engine code. Fixes the FSM, the
step-level modality contract, the difficulty curve, the RNG, the fail model,
the recovery quotas, the mobile and audio rules, the timing/abort model, the
build assertion, and the trace algorithm (§12, stated in full before any of it
is implemented, per the brief).

**Engine** (`src/core/`):

- `engine.ts` — the eight-state FSM
  (`BOOT`/`LEVEL_SETUP`/`PRESENTING`/`CAPTURING`/`SCORING`/`LEVEL_UP`/`FAIL`/`PAUSED`).
  Owns the sequence loop, all timing, and all `AbortController`s. `SCORING` is
  entered once per step, so a single sequence can interleave modalities.
- `rng.ts` — the seeded LCG, `Math.imul` for an exact 32-bit multiply, warmed
  4 steps so adjacent seeds do not open identically. FNV-1a for string seeds.
- `clock.ts` — every wait is rAF-driven off the timestamp rAF hands the
  callback. There is no `setTimeout` in the game loop.
- `abort.ts` — controller registry (the leak test's instrument) and `linkAbort`.
- `schedule.ts` — the level schedule as data, resolved against the registry.
- `registry.ts` — the plugin boundary.
- `audio.ts` — no `AudioContext` until the first gesture; one node graph per
  note, disposed on `ended`.
- `emitter.ts` — display-only event channel, isolated from subscriber throws.

**Modalities** (`src/modalities/`) — `color` and `number`, both on a shared
`DiscreteGridModality` base that owns the four-pad DOM, Pointer-Events-only
capture on `pointerdown`, and presentation marking. Cardinality lives in the
modality. `src/modalities/index.ts` is the whole registry.

**UI** (`src/ui/app.ts`) — HUD (level, mode, step, both quotas), stage,
overlay. The overlay's start button is the only place audio is unlocked.

Levels 1 and 2 are playable end to end, verified in a real browser.

## Commands I ran, and their output

### `npm run build`

```
✓ 21 modules transformed.
[plugin vite:singlefile] Inlining: index-BLmFkear.js
[plugin vite:singlefile] Inlining: style-BlkCcT1V.css
dist/index.html  20.89 kB
✓ built in 188ms
assert-selfcontained: OK — dist/index.html is self-contained (20.4 kB, no external refs)
```

`dist/` contains exactly one file. The guard fails the build on stray dist
files, non-inert URL attributes, external `url()`/`@import`, absolute or
protocol-relative URL literals, and runtime network APIs. XML namespace URIs
are exempt — identifiers, not fetches.

### `npm test`

```
✓ tests/rng.test.ts (12 tests) 201ms
✓ tests/build-guard.test.ts (8 tests) 465ms
✓ tests/leak.test.ts (1 test) 510ms
✓ tests/modalities.test.ts (18 tests) 84ms
✓ tests/engine.test.ts (14 tests) 68ms
✓ tests/progression.test.ts (17 tests) 10ms
✓ tests/schedule.test.ts (11 tests) 10ms

Test Files  7 passed (7)
     Tests  81 passed (81)
```

### `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test`

```
✓ tap-to-start unlocks audio, and nothing is constructed before the gesture (565ms)
✓ level 1 completes and the run advances to level 2 (4.8s)
✓ a second backgrounding ends the run (3.6s)
✓ a wrong tap ends the run immediately (0 lives) (3.6s)
✓ the built single-file artifact boots with no network requests (134ms)
✓ interactive targets meet the 44px minimum (CANON §8) (240ms)
✓ backgrounding mid-capture pauses, and resuming replays with no phantom timeout (12.4s)

7 passed (15.1s)
```

## What passed

**Unit.** RNG determinism per seed, divergence across seeds, warm-up
decorrelation, range invariants over thousands of draws, and a locked-in stream
for `seed=1` so a generator change breaks a test rather than every recorded
repro. `stepsForLevel` at 1→3, 5→7, 6→10, 10→15, 20→28 plus monotonicity to
level 100. `paceForLevel` at 1/2/5/10/20 and the 250 ms floor. `scoreStep` for
both registered modalities across all 4×4 input/expectation pairs. Schedule
mapping, interleaving from level 6, and deterministic substitution.

**Integration (fake timers, driving real rAF).** A full level 1 run through to
level 2; the canonical state path
`LEVEL_SETUP→PRESENTING→CAPTURING→SCORING→CAPTURING`; seeded reproducibility
across two engines; wrong-step early fail with exactly one score emitted;
capture-timeout fail; abort mid-presentation; abort mid-capture; the audio gate
refusing to start on a suspended context; both quotas emitted and the per-level
retry resetting.

**Focus-loss recovery.** Pause on the first backgrounding, 10 s of fake time
spent parked in `PAUSED` with no fail event (the phantom-timeout check), then a
resume that re-presents the *identical* sequence — asserted element-wise, not
by length — and clears to level 2. Second backgrounding ends the run with
reason `focus-lost`.

**Leak.** 50 levels, 1718 presented steps, 2000+ controllers created, using the
real `ColorModality` with real DOM listeners. Live `AbortController` count
sampled at all 50 level-ups: every sample 0. Live listener count: flat across
all 50 samples and equal to the pre-run baseline, and back to baseline after
`destroy()`.

The listener instrumentation is worth a note, because the obvious version of it
lies. Counting `addEventListener`/`removeEventListener` calls reports leaks that
do not exist: a listener registered with `{ signal }` is dropped when the signal
aborts, and one registered with `{ once: true }` is dropped after its first
dispatch — neither calls `removeEventListener`. Both are load-bearing here, so
the instrument tracks signal state and wraps once-listeners to observe their
firing. Before that fix it reported a 50-listener "leak" that was entirely the
measurement.

**e2e (real Chromium, Pixel 5 viewport, headless, against `dist/index.html`).**
`AudioContext` construction count is 0 before the tap and 1 after, with state
`running` — the constructor is genuinely not reached before the gesture. Level 1
completed by observing the presented sequence through a `MutationObserver` and
tapping it back. Backgrounding, the 4.5 s phantom-timeout window, replay, and
the second-backgrounding kill. Wrong tap ends the run. All four pads and the
start button measured ≥44×44 CSS px from real layout boxes.

## What is UNVERIFIED, and why

- **Real backgrounding.** Playwright cannot background a tab. The e2e overrides
  `document.hidden`/`visibilityState` and dispatches the real
  `visibilitychange` event, so the production handler runs unmodified — but an
  actual OS-level app switch, and whatever the browser does to rAF and audio
  around it, is not exercised. The fake-timer integration tests have the same
  boundary.
- **Audible output.** No test listens. The audio path is verified only as far
  as "an `AudioContext` was constructed exactly once, at the right moment, and
  reports `running`". That no sound is malformed, clipped, or mistimed is
  unverified.
- **Touch on real hardware.** Pixel 5 emulation with `hasTouch` is not a
  finger. Pointer capture behaviour, palm rejection, and the 44 px targets
  under an actual thumb are unverified.
- **iOS Safari.** Nothing was run on WebKit. `100dvh`, `env(safe-area-inset-*)`,
  and the Web Audio unlock rules are exactly where iOS differs, and all three
  are load-bearing.
- **Levels 3+ as designed.** Reaching level 3 today substitutes colour/number
  for shape/sound/trace (`decisions/0004`). The substitution path is unit
  tested; the levels it stands in for do not exist yet.
- **The `pointercancel` retry.** The quota is engine state and is surfaced in
  the HUD, per CANON §7. Nothing decrements it — the wiring is a Phase B
  deliverable. The counter is currently decorative.
- **Trace (CANON §12).** Specified in full, implemented not at all.
- **Performance.** No frame timing was measured. The Phase C budget
  (no allocation in the animation loop, 60 fps throttled) is untested.

## Decisions logged

| ADR | Resolution |
| --- | --- |
| [0001](../decisions/0001-seeded-lcg.md) | Numerical Recipes LCG via `Math.imul`, warmed 4 steps |
| [0002](../decisions/0002-inter-step-gap.md) | Inter-step gap = 25% of pace, floor 100 ms |
| [0003](../decisions/0003-per-note-audio-nodes.md) | One node graph per note; no voice pool |
| [0004](../decisions/0004-schedule-substitution.md) | Unregistered scheduled modalities substitute from the registered pool |
| [0005](../decisions/0005-focus-loss-semantics.md) | Replay quota checked on hide, consumed on resume; replay re-presents the existing sequence |
| [0006](../decisions/0006-trace-normalization.md) | Arc-length resampling to 32 points, RMS normalization, index-aligned distance |
| [0007](../decisions/0007-e2e-observes-dom-not-a-test-hook.md) | e2e reads the presented sequence from the DOM; no shipped test hook |
| [0008](../decisions/0008-capture-timeouts.md) | 3000 ms discrete capture timeout, counted by the engine |
| [0009](../decisions/0009-level-up-hold.md) | 600 ms level-up hold; engine isolated from subscriber exceptions |

## One CANON correction

CANON's pace table originally read `10 → 505`, `33 → 251`, `34 → 250` and said
the floor first binds at level 34. **CANON was wrong** — arithmetic error in the
table, not in the formula. Computed from `max(250, round(800 · 0.95^(n−1)))`,
the values are `10 → 504`, `23 → 259`, `24 → 250`, and the floor first binds at
**level 24**. The formula is unchanged and the code always matched it; the table
is now corrected.

## What I would attack first if I were trying to break this

1. **Input during a state the engine thinks is closed.** Capture listeners are
   bound to the step signal and the engine aborts it the moment capture
   resolves — but abort is asynchronous with respect to a `pointerdown` already
   queued in the event loop. Two fast taps on the same beat, or a tap landing in
   the window between resolve and abort, is where I would look for a
   double-submit. The promise settles once, so I believe it holds, but I did not
   write a test that fires two `pointerdown`s in the same task.
2. **`visibilitychange` at a state boundary.** The handler reads `#state` and
   decides pause-vs-fail. Fire it in the microtask gap between `PRESENTING`
   ending and `CAPTURING` beginning, or during `SCORING`, and it is ignored
   entirely — the run keeps going with a backgrounded tab. The quota semantics
   are tested at the two easy points, not at the seams.
3. **Replay accounting under repeated interruption.** The quota is checked on
   hide and consumed on resume, which means hide→resume→hide→resume is tested
   but hide→hide (two hides with no intervening resume, possible if the event
   fires twice) is not.
4. **rAF starvation.** Every wait, including the capture timeout, is a chain of
   animation frames. A browser that throttles rAF to 1 Hz in a partly-occluded
   tab stretches a 3 s timeout into something much longer, and a browser that
   stops rAF entirely stops the game clock without entering `PAUSED`. That is
   arguably correct behaviour, but it is unexamined.
5. **The `?seed=` contract across substitution.** Substitution consumes RNG
   draws from the run generator. That keeps a given build reproducible, but a
   seed recorded on today's two-modality build will *not* replay the same on a
   five-modality build. If seeds are ever shared between players, that is a
   correctness bug waiting to be filed.
6. **`exactOptionalPropertyTypes` and the modality contract.** `scoreStep` is
   trusted to be pure and synchronous. Nothing enforces it. A modality that
   mutates DOM or throws inside `scoreStep` corrupts the run in a way the engine
   has no defence against.

## Not started

Phase B (shape, sound, trace, `pointercancel` wiring, levels 1–6 interleaved)
and Phase C (sixth modality as plugin proof, VFX, accessibility, persistence,
perf budget). Both are gated on approval of this report.
