# MODESHIFT — UAT and build report

Build: `MODESHIFT_AAA_CASINO_BUILD_20260814_0515.html`
SHA256: `8c4eca22ce168a0ecc5f2c3d92626fdacb09e38c5afacf366d5968c4c83bb2b6`
Size: 50,002 bytes, one self-contained file.

Everything below was produced by running the command shown, in this container,
on this commit.

---

## 1. Audit of the four attached builds

Read: `MODESHIFT_GPT_WORK_UAT_PERF_TUNED_20260813_2257`,
`MODESHIFT_READABLE_SEQUENCE_BUILD_20260813_2225` (both in full),
`MODESHIFT_ULTIMATE_FUSION_v41` (2,696 lines; structure and feature markers),
`MODESHIFT_CASINO_FEEL_RESTORED_20260813_23031`.

### Working, and worth keeping

Splash → menu → game flow; six modalities including a real trace pad; difficulty
multipliers; canvas confetti/coins/balloons/streamers; versioned localStorage
with a corrupt-data fallback; a `prefers-reduced-motion` block; and in
PERF_TUNED, a genuine readability pass that dims unlit pads during presentation.
The casino direction is right and the arcade energy is real.

### What breaks immersion, correctness, or FPS

| # | Finding | Where | Why it matters |
| --- | --- | --- | --- |
| 1 | `click` and `keydown` appear **0 times** in v41; all four bind chrome to `pointerdown` only | all 4 | Keyboard and assistive-tech users cannot start or play. Silent no-op, no error. |
| 2 | `fetch(` present (Vite modulepreload polyfill) | 3 of 4 | Violates "no runtime network requests" as written; fails a self-contained assertion. |
| 3 | `tick()` re-requests rAF unconditionally — the loop never stops | READABLE | 60 fps burned with zero particles on screen. Violates the perf rule outright. |
| 4 | Rhythm pattern `[180,180,360,540]` has 4 intervals; capture resolves at `>= 3` | all 4 | The 4th interval is never captured. That pattern is **unpassable on any device**. |
| 5 | `body { touch-action: none; overflow: hidden }` with 11 radio controls | all 4 | On a short phone the menu cannot scroll and Start is unreachable. |
| 6 | Trace: `D_MAX 0.35`, pass `0.85`, raw pad coordinates, no scale/offset normalisation | all 4 | Mean deviation must be ≤ 0.0525 in normalised units. A correct-but-offset or smaller trace fails. |
| 7 | `.modality::before/::after` fixed streamer bars over the playfield | all 4 | Decoration sits on the play surface during capture. |
| 8 | `shadowBlur` on every spark | READABLE | The most expensive canvas op, applied per particle per frame. |
| 9 | Particle cap 900, DPR cap 2 | READABLE | Both far above what a mid-range phone sustains. |
| 10 | `.app::after` conic-gradient border with `drop-shadow`, animating 1.9 s infinite | all 4 | A permanent full-screen animated filter; PERF_TUNED slows it during play but never stops it. |

Findings 1, 3, 4, 5, 6, 8, 9 are fixed in this build; 2, 7, 10 do not exist in it.

---

## 2. What changed

**Six modalities**, each a plugin behind one contract:

- colour, number (existing), **shape** (inline SVG glyphs), **sound**,
  **trace**, **rhythm**.
- Sound deliberately does **not** light the presented pad — the cue is the
  pitch, and lighting the pad collapses the mode into colour-with-a-beep
  (`decisions/0012`). The grid pulses as a whole instead.
- Rhythm capture ends on **silence**, not a tap count, which is what makes
  finding #4 structurally impossible here (`decisions/0013`).
- Trace implements CANON §12 exactly: arc-length resample to 32 points,
  centroid-to-origin, RMS-radius-1 normalisation, index-aligned mean distance,
  `accuracy = 1 − meanDist`, pass at 0.85. Scale- and position-invariant.

**Modes and difficulty.** Classic Climb, Mixed Type, and one single-modality
mode per registered modality — generated from the registry, so a new modality
adds its own mode for free. Mixed gives `level + 2` steps of every modality:
3 each in phase 1, 4 in phase 2, 5 in phase 3. Difficulty scales presentation
speed and capture budget only, never step counts or thresholds.

**Presentation layer.** Splash with animated marquee and logo; menu with mode
cards, difficulty segmented control, and per-mode bests; game HUD with level,
mode, step, combo, and both recovery quotas.

**Audio.** Nine cues (`splash`, `menuTick`, `menuSelect`, `start` slot-pull,
`correct`, `levelUp`, `fail`, `pause`, `resume`), all synthesized, single-use
oscillators, master `DynamicsCompressor` so the jackpot stack is loud without
clipping. `correct` climbs a pentatonic ladder with the combo, so a streak
sounds like one.

**FX on a tested budget** (`decisions/0014`): loop starts on the first particle
and stops the frame after the last one dies; `clear()` on `LEVEL_SETUP` and
`PRESENTING`; 220-particle cap (40 under reduced motion); DPR capped at 1.5; no
`shadowBlur` anywhere.

**Haptics** via `navigator.vibrate`, suppressed under reduced motion.
**Persistence**: best level overall and per mode, last seed, per-modality
accuracy; versioned, corrupt-data fallback, never throws.

---

## 3. Bugs found *in this build* by the test suite

Three, all caught by e2e rather than by reading the code.

**Click-through across screens.** Tapping splash PLAY skipped the menu entirely
and landed in the game. Navigating on `pointerdown` while replacing the DOM
means the trailing `click` is dispatched at the same coordinates onto whatever
now occupies them. Fixed by binding navigation to `click` only and priming audio
separately on `pointerdown` (`decisions/0015`). This also supersedes the
both-events approach from `decisions/0010`.

```
splash starts on tap
  Expected: "menu"
  Received: "game"
```

**An invisible shield over the playfield.** All six modality containers occupy
the same grid cell and stretch to fill it, so the last in DOM order sat on top
of the play surface and swallowed every pointer event:

```
element at trace pad centre: DIV.mod-root
```

Trace and rhythm were completely unplayable. Fixed with `pointer-events: none`
on the container and `auto` on its content. After the fix:

```
color   -> BUTTON.grid__pad
trace   -> polyline.trace__expected
rhythm  -> SPAN.rhythm__ring
```

**A detached MutationObserver.** The e2e sequence observer ran in an init script
and observed `document.documentElement`, which does not exist that early. It
threw, silently, leaving every sequence assertion vacuous. Now observes
`document`.

---

## 4. Commands run, and their output

### `npm run typecheck`

```
> tsc --noEmit
```
Clean. TypeScript strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.

### `npm test`

```
✓ tests/rng.test.ts (12)          ✓ tests/trace-geometry.test.ts (18)
✓ tests/build-guard.test.ts (8)   ✓ tests/rhythm.test.ts (11)
✓ tests/leak.test.ts (1)          ✓ tests/modes.test.ts (22)
✓ tests/modalities.test.ts (18)   ✓ tests/schedule.test.ts (11)
✓ tests/engine.test.ts (14)       ✓ tests/progression.test.ts (17)
✓ tests/fx.test.ts (9)

Test Files  11 passed (11)
     Tests  141 passed (141)
```

### `npm run build`

```
dist/index.html  50.00 kB
assert-selfcontained: OK — dist/index.html is self-contained (48.8 kB, no external refs)
```

### `node scripts/assert-selfcontained.mjs artifact`

```
assert-selfcontained: OK — (48.6 kB, no external refs)
```

### `npx playwright test` — real Chromium, Pixel 5 viewport, headless

```
25 passed (58.6s)
```

### Hash

```
sha256  8c4eca22ce168a0ecc5f2c3d92626fdacb09e38c5afacf366d5968c4c83bb2b6
size    50002 bytes
```

---

## 5. What passed

**Unit (141).** RNG determinism and a locked-in stream for `seed=1`;
`stepsForLevel` at 1/5/6/10/20; pace curve and its 250 ms floor at level 24;
mode plans for classic, mixed (3→4→5 per type), and every single-modality mode;
difficulty multipliers; `scoreStep` for colour and number across all 4×4 pairs;
**trace geometry** — arc-length resampling, RMS normalisation, scale and
position invariance, direction sensitivity, stray-tap rejection, and the **0.85
boundary binary-searched and asserted from both sides**; **rhythm scoring** —
exact match, tempo invariance, wrong-shape failure, dropped-beat failure,
jitter tolerance; **FX lifecycle** — loop starts on emit, stops when empty,
`clear()` cancels synchronously, cap respected under hammering, DPR capped,
and `shadowBlur` never written (asserted by recording property writes on a
proxied canvas context); the 50-level leak check still returns
`AbortController` and DOM listener counts to baseline.

**e2e (25).** No `AudioContext` before the first gesture and `running` after;
colour level 1 completed and advancing to level 2 with combo 3; wrong tap ends
the run; backgrounding pauses, 4.5 s of real time passes with no phantom
timeout, resume replays the identical sequence, second backgrounding kills the
run; overlay restart and return-to-menu; mode and difficulty selection reaching
the run; **sound presenting with zero pads marked**; shape completable;
**trace played for real** — glyph observed, confirmed hidden at capture, redrawn
with the mouse, scored a pass; **rhythm capture closing on silence** with four
taps and no fifth; menu scrolling to reach Start at 320×480; all six activation
paths (tap, click, Enter, Space, synthetic click, keyboard reachability, no
double-fire); 44 px minimum targets measured from real layout boxes; zero
subresource requests for both `dist/` and the repackaged artifact.

---

## 6. UNVERIFIED

**UNVERIFIED: real browser/mobile FPS and interactive UAT could not be run in
this environment.** No frame timing was measured anywhere. The FX budget is
enforced structurally (loop lifecycle, particle cap, DPR cap, no `shadowBlur`)
and each rule has a unit test, but "60 fps on a throttled mobile profile" is
**not measured** and must not be read as measured.

Also unverified:

- **Audible output.** Nothing listens. Audio is verified only as far as "an
  `AudioContext` was constructed exactly once, at the right moment, and reports
  `running`". Whether the nine cues sound good, or clip, is unknown.
- **Haptics.** `navigator.vibrate` is not implemented in headless Chromium. The
  call sites are exercised; no vibration was observed.
- **Real touch hardware.** Pixel 5 emulation is not a finger. Pointer capture
  during a trace stroke, palm rejection, and 44 px targets under a thumb are
  unverified.
- **iOS Safari — entirely.** `100dvh`, `env(safe-area-inset-*)`, and the Web
  Audio unlock rules are exactly where iOS differs, and all three are
  load-bearing.
- **Real backgrounding.** Playwright cannot background a tab; the e2e overrides
  `document.hidden` and fires the real `visibilitychange`, so the production
  handler runs unmodified, but an OS-level app switch is not exercised.
- **Trace on a real finger.** The e2e draws with a synthetic mouse at 12
  interpolation steps per segment. Human strokes are denser and messier.
- **Long-run play.** Nothing has played past level 2 interactively; levels 3+
  and Mixed phase 2+ are covered by unit tests on the plan, not by play.

---

## 7. Biggest remaining risk

**The 8-sample stray-tap guard on trace, on real hardware.**

The e2e caught this the hard way: replaying the two-point `line` glyph at 6
interpolation steps produced exactly 7 samples, one under `MIN_SAMPLES = 8`, and
a geometrically *perfect* trace was rejected outright with accuracy 0 — a
guaranteed level loss, and it looked exactly like a scoring bug. Raising the
test's sampling density fixed the test, but the guard itself is unchanged.

On real hardware `pointermove` fires at 60–120 Hz with coalesced events, so a
deliberate stroke yields far more than 8 samples. But a **fast confident flick**
along a straight glyph is the exact case that produces the fewest samples, and
it is also the most likely input from a player who knows the answer. If trace
starts failing for good players on real devices, this guard is the first
suspect — not the 0.85 threshold.

The fix, if it appears, is to gate on **arc length in CSS px** (already
implemented, 24 px) and drop the sample-count gate, since arc length is what
actually distinguishes a stroke from a tap. That change is one line and one
test; it has not been made because nothing has yet demonstrated the guard
firing on real input.

Runner-up: **sound is materially harder than the other five modes** and a
tone-deaf player simply cannot pass it. Bar-height ramps and note names give a
learnable ordering, but no playtesting has established whether that is enough.
