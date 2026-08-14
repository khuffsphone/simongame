# CANON.md

Single source of truth for MODESHIFT. If code and this document disagree, one
of them is a bug — say which, and fix that one. Do not silently reconcile.

Values written here are normative. Where the brief was underspecified, this
document states the resolution and `./decisions/` records the tradeoff.

---

## 1. Shipping constraint

The build emits **one self-contained `dist/index.html`**: JS and CSS inlined,
no CDN, no external assets, zero network requests at runtime. All audio is
synthesized with the Web Audio API. All art is CSS, SVG, or Canvas.

`scripts/assert-selfcontained.mjs` runs as the last step of every build and
fails it if the artifact references any external URL or calls a network API.
See §11.

---

## 2. Engine FSM

Eight states. The engine is the only owner of state transitions.

```
BOOT ──start()──> LEVEL_SETUP ──> PRESENTING ──> CAPTURING ──> SCORING
                       ^                                          │
                       │                              pass, more steps
                       │                                          │
                       │                                          v
                  LEVEL_UP <────── pass, sequence exhausted ──────┘
                       │
                       └──> LEVEL_SETUP (level + 1)

SCORING ──fail──> FAIL ──start()──> LEVEL_SETUP (level 1, new seed)

PRESENTING│CAPTURING ──document hidden──> PAUSED ──visible──> LEVEL_SETUP (replay)
PRESENTING│CAPTURING ──document hidden, no replay quota──> FAIL
```

| State | Meaning | Exits to |
| --- | --- | --- |
| `BOOT` | Mounted, audio not unlocked, awaiting first gesture | `LEVEL_SETUP` |
| `LEVEL_SETUP` | Sequence generated for the level, nothing on screen yet | `PRESENTING` |
| `PRESENTING` | Engine is playing the sequence back to the player | `CAPTURING`, `PAUSED`, `FAIL` |
| `CAPTURING` | Engine is collecting the player's reproduction, step by step | `SCORING`, `PAUSED`, `FAIL` |
| `SCORING` | A captured step is being scored | `CAPTURING`, `LEVEL_UP`, `FAIL` |
| `LEVEL_UP` | Level cleared; a 600 ms celebration beat (`decisions/0009`) | `LEVEL_SETUP` |
| `FAIL` | Run over | `LEVEL_SETUP` (via `start()`, level 1, new seed) |
| `PAUSED` | Backgrounded mid-play, one replay owed | `LEVEL_SETUP` (replay current level) |

**`BOOT` → `LEVEL_SETUP` is gated on audio.** The engine MUST NOT enter
`PRESENTING` unless `audio.state === 'running'`. `start()` rejects otherwise.

`SCORING` is entered once **per step**, not once per level. Scoring is
synchronous; the state is observable so the UI can flash pass/fail feedback.

---

## 3. Modality contract

A modality is a plugin. Adding one must touch exactly two things: the new file,
and its entry in the registry. Zero engine files. The engine owns the sequence
loop, so one sequence can interleave modalities step by step.

### Static side (`ModalityClass`)

| Member | Type | Meaning |
| --- | --- | --- |
| `id` | `string` | Stable unique key, used by the level schedule and persistence |
| `minPresentMs` | `number` | Floor on presentation time for one step of this modality |
| `captureTimeoutMs` | `number` | Time budget for one captured step before a timeout fail |
| `generateValue(rng, level)` | `(Rng, number) => V` | Produces one step value. **Cardinality lives in the modality**, not the engine |
| `describeValue(value)` | `(V) => string` | The answer in words, for the failure reveal (§6). Required |
| `describeCapture(capture)` | `(C) => string` | What the player did, in the same register. Required |

### Instance side (`Modality`)

| Method | Contract |
| --- | --- |
| `mount(container, services)` | Build all own DOM inside `container`. Called once. Modalities never touch DOM they did not create. |
| `unmount()` | Remove everything `mount` created. Release every listener. |
| `activate(signal)` | This modality is about to be used. Show itself. Aborting `signal` deactivates it. |
| `deactivate()` | Hide itself, drop transient state. Idempotent. |
| `presentStep(value, durationMs, signal)` | Display `value` for `durationMs`. Resolves when the presentation beat is over. Rejects `AbortError` if aborted. |
| `captureStep(signal)` | Resolve with `{value, meta}` on player input. Rejects `AbortError` if aborted. **Never resolves on its own timer** — the engine owns the timeout. |
| `scoreStep(input, expected)` | `{pass, accuracy}`. Pure. `input` is the `captureStep` result; `expected` is the `generateValue` result. `accuracy` ∈ [0, 1]. |

The contract is generic over **two** types, `Modality<V, C>`: `V` is what
`generateValue` produces and `scoreStep` expects, `C` is what `captureStep`
returns. For the discrete modalities they are the same. For trace they are not —
the value is a glyph name, the capture is a point array — and collapsing them
into one parameter forced a lie in the type (`decisions/0011`).

Rules:

- Every async method takes an `AbortSignal` and rejects with a `DOMException`
  of name `AbortError` when it fires. No exceptions.
- Modalities receive services by injection (`audio`, `clock`, `reducedMotion`).
  No globals, no reaching for `document` outside their own container.
- `scoreStep` must be pure and synchronous so it is unit-testable without DOM.

---

## 4. Progression

### Length per level — normative

There is no `stepsForLevel`. Level length is derived from the cognitive budget
below; `budgetForLevel(n)` carries the old formula, and the number of steps it
buys depends on which modalities fill it.

```
budgetForLevel(n) = n <= 5 ? n + 2 : floor(n * 1.25) + 3
```

| n | 1 | 5 | 6 | 10 | 20 | 30 |
| --- | --- | --- | --- | --- | --- | --- |
| `budgetForLevel(n)` | 3 | 7 | 10 | 15 | 28 | 40 |

### Pacing — normative

Global pace starts at 800 ms/step and drops 5% per level, with a **400 ms**
floor:

```
paceForLevel(n) = max(400, round(800 * 0.95^(n - 1)))
```

| n | 1 | 2 | 5 | 10 | 14 | 15 | 30 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `paceForLevel(n)` | 800 | 760 | 652 | 504 | 411 | 400 | 400 |

The floor first binds at level 15.

> **Correction.** The floor was 250 ms, first binding at level 24. Two knobs
> were turning the same way: the budget grows every level *and* exposure kept
> shrinking, so past roughly level 10 the game stopped measuring recall and
> started measuring perception — a player who could hold the sequence still
> failed, because they were never given long enough to encode it.
> **CANON was wrong.** See `decisions/0018`.

**Length is the only difficulty knob that climbs without bound.** Once the
pace floor binds, pace is constant; only the budget moves. This is tested.
The budget's own 40-step cap binds at level 30 for an all-cheap pool, past
which nothing increases — accepted, because a 40-item sequence is already far
beyond human span and no measured run has reached it.

The engine presents each step for:

```
presentMs = max(paceForLevel(level), modality.minPresentMs)
```

**Inter-step gap** (underspecified in the brief; see `decisions/0002`):

```
gapMs(pace) = max(100, round(pace * 0.25))
```

The gap exists so two consecutive identical values read as two beats rather
than one long one. It is dead air, not presentation time.

### Curriculum — teach, then integrate

> **Correction.** The previous schedule was one modality per level for levels
> 1-5, then *every* modality at 10 steps from level 6. That is a wall, not an
> escalation — and rhythm was never in the schedule at all, so it first appeared
> interleaved and untaught. **CANON was wrong.** See `decisions/0017`.

| Level | Pool | Kind |
| --- | --- | --- |
| 1 | `color` | teach |
| 2 | `number` | teach |
| 3 | `color`, `number` | integrate |
| 4 | `shape` | teach |
| 5 | `color`, `number`, `shape` | integrate |
| 6 | `sound` | teach |
| 7 | `color`, `number`, `shape`, `sound` | integrate |
| 8 | `trace` | teach |
| 9 | `rhythm` | teach |
| 10 | all six | integrate |
| 11+ | all six | continues |

Invariant, and tested: **no modality appears in an integration level before it
has had a teaching level.** The ladder is data
(`src/content/curriculum.ts`). A pooled modality that is not registered is
substituted from the registered pool, deterministically (`decisions/0004`).

### Cognitive budget — length is not difficulty

Thirteen colour taps and thirteen traced glyphs are not the same task. Levels
are generated against a **cognitive budget** rather than a step count:

| Modality | Cost |
| --- | --- |
| colour, number | 1.00 |
| shape | 1.10 |
| sound | 1.25 |
| rhythm | 2.00 |
| trace | 2.50 |

`budgetForLevel(n)` is deliberately the old step-count formula, so a colour
level generates exactly the number of steps it always did and the familiar
curve is preserved. Only levels containing expensive modalities get shorter —
a level-8 trace round is **five drawings, not thirteen**.

Bounds: at least 2 steps however expensive the pool, at most 40 however cheap.
Difficulty scales the budget (easy 0.85, normal 1.0, hard 1.2) and never the
perception floor: a harder level is longer, not dimmer or faster than the eye
can follow.

### Game modes and difficulty — §4a

> **Correction.** This table described "Classic Climb" and "Mixed Type", which
> `src/core/modes.ts` has not implemented since the curriculum landed.
> **CANON was stale**, not the code. Corrected below.

| Mode | id | Behaviour |
| --- | --- | --- |
| Classic Circuit | `classic` | The teaching ladder above, budgeted. |
| Quick Mix | `quickmix` | Every registered modality, interleaved, budget capped at **12** however far you climb. Short by construction. |
| Marathon | `marathon` | Every registered modality, **level + 2** steps each, grouped by modality in registration order. Step-counted, not budgeted — the one mode that keeps the old behaviour on purpose. |
| *Modality* only | the modality id | Every step is that modality, budgeted. One mode per registered modality, generated from the registry — adding a modality adds its mode for free. |

Difficulty scales two things and nothing else:

| | easy | normal | hard |
| --- | --- | --- | --- |
| presentation multiplier | 1.20 | 1.00 | 0.82 |
| capture-timeout multiplier | 1.40 | 1.00 | 0.85 |

Easy presents *slower* and allows *longer* to answer. Difficulty never changes
step counts, the schedule, or scoring thresholds.

### Adaptive assist — §4b

Per-modality accuracy has been persisted since the first build. It is now read.

A modality's pass rate scales **time and nothing else**:

| what | scaled |
| --- | --- |
| presentation duration | yes, 0.90× – 1.35× |
| capture timeout | yes, 1.00× – 1.35× (never shortened) |
| step count, cognitive budget, ladder, RNG draws, scoring thresholds | **never** |

```
scale(rate) = rate < 0.60 ? 1 + (0.60 - rate)/0.60 * 0.35
            : rate > 0.90 ? 1 - (rate - 0.90)/0.10 * 0.10
            : 1
```

Normative constraints:

1. **A modality needs 8 attempts before its record moves anything.** Two bad
   levels are not a diagnosis.
2. **The record forgets.** Effective sample size is capped at 40 attempts via an
   exponential moving average, so an assist can be earned out of. Lifetime totals
   are a trap the player cannot escape.
3. **The assist is disclosed every level**, by name, in the seed footer, and as
   `assisted` on the `level` event. A difficulty change the player cannot see is
   a difficulty change they cannot trust.
4. **Pressure never shortens the answer clock.** Taking time away from a player
   who is answering correctly is a punishment for competence.
5. **The perception floor still binds.** A tightened presentation is clamped at
   the modality's `minPresentMs`.
6. **Fixed rulesets refuse adaptivity outright** — `adaptivityAllowed(mode)`,
   not a default that can be forgotten. `daily` is already in that set although
   the Daily Challenge does not exist yet, so it cannot ship without the gate.

See `decisions/0019`.

### Discrete cardinality

Colour, number, shape, and sound each expose **4 options**. Cardinality is
owned by the modality, never by the engine.

---

## 5. RNG — seeded LCG

Numerical Recipes 32-bit LCG:

```
state ← (1664525 * state + 1013904223) mod 2^32
float ← state / 2^32                    // [0, 1)
nextInt(n) ← floor(float * n)           // [0, n)
```

- `state` is seeded with `seed >>> 0`, then advanced **4 times** before first
  use to wash out low-entropy seeds (`seed = 0` and `seed = 1` must not
  produce visibly related openings).
- Multiplication uses `Math.imul` so it stays exact in 32 bits.
- A string seed hashes to `uint32` via FNV-1a.
- Same seed ⇒ same sequence, always. This is a tested invariant.

See `decisions/0001`.

### Seeding a run

- `?seed=<value>` forces a deterministic run. The seed survives `FAIL` →
  restart, so a repro can be replayed indefinitely.
- Without `?seed=`, each run draws a fresh seed. Restarting after a fail draws
  a new one — per the fail model, this is a new run.

---

## 6. Fail model

- **0 lives.** The first wrong step ends the run — the engine early-fails on
  that step and does not present the remainder of the sequence.
- A capture timeout (`captureTimeoutMs` elapsed with no input) is a fail.
- `FAIL` → `start()` resets to **level 1** with a **new seed**, unless `?seed=`
  pinned the run.
- Score reported to the UI is the level reached, not a point total.

### The run must reveal the answer — normative

A run may not end without saying what the correct answer was. The `fail` event
carries `expected` (the step it died on), `received` (what the player did), and
`accuracy`; the overlay renders all three.

This is not a hint and not a spoiler. The run is over, the sequence is spent,
and the next run generates a different one — there is nothing left to protect,
and withholding it means the player cannot tell a memory failure from a
misperception. See `decisions/0020`.

Both halves of the reveal are part of the modality contract (§3) and are
**required**, not optional:

```ts
static describeValue(value: V): string     // "Blue", "a zigzag"
static describeCapture(capture: C): string // what the player did
```

An optional method here would let a modality ship with no reveal, which is the
defect. Two methods rather than one because value and capture are different
types for trace (a stroke, not a glyph name) and rhythm (intervals, not a
pattern index).

Rules:

- `focus-lost` reveals nothing. The player was not wrong, they were away.
- A timeout reveals the answer and never claims an input that did not happen.
- The attempt line is dropped when it would read identically to the answer —
  trace and rhythm score by shape, so a failing attempt can legitimately carry
  the same description.
- A formatter that throws costs its own line and nothing else. The overlay
  always opens.

---

## 7. Recovery quotas

Two quotas. Both are surfaced in the HUD at all times, not just when spent.

### Focus-lost replay — one per run

- `document.hidden` becomes true during `PRESENTING` or `CAPTURING`:
  - replay quota remaining ⇒ abort the phase, go `PAUSED`;
  - quota exhausted ⇒ the run **ends immediately** (`FAIL`).
- Returning to visible from `PAUSED` consumes the quota and replays the
  **current level from step 0**: the same sequence is presented again and
  capture restarts. The level is not skipped and the sequence is not
  regenerated.
- Consequence, and this is the intended reading of "second backgrounding ends
  the run": the first backgrounding pauses, the second kills the run. See
  `decisions/0005`.
- An aborted phase must leave **no pending timer**. A capture timeout armed
  before a pause must never fire after the replay — this is the "phantom
  timeout" the e2e suite exists to catch.

### `pointercancel` retry — one per level

- A `pointercancel` during capture consumes the level's retry and re-captures
  that step. The presented sequence is unchanged.
- The quota resets on every `LEVEL_SETUP`.
- Exhausted ⇒ a second `pointercancel` in the same level is a fail.
- Engine-side state and HUD land in Phase A; the `pointercancel` wiring is a
  Phase B deliverable per the brief.

---

## 8. Mobile

- **Pointer Events only** for game input. No mouse or touch event handlers on
  play surfaces.
- Discrete input commits on `pointerdown`, not `pointerup` or `click`.
- This governs the pads, not UI chrome. Chrome buttons (start, restart) also
  bind `click`, so keyboard and assistive activation work; binding them to
  `pointerdown` alone makes them silent no-ops (`decisions/0010`).
- Interactive targets are **≥ 44 × 44 CSS px**.
- Safe-area insets respected via `env(safe-area-inset-*)`.
- `touch-action: none` on the play surface while a run is live, and only then.
- Full-height layout uses `100dvh`.

---

## 9. Audio

- **No `AudioContext` is constructed until the first user gesture.** The
  constructor call happens inside the tap handler.
- The engine cannot enter `PRESENTING` unless `audio.state === 'running'`.
- `OscillatorNode` is single-use. MODESHIFT allocates **one node graph per
  note** and disposes it on the `ended` event — no voice pool. See
  `decisions/0003`.
- Per-note graph: `OscillatorNode → GainNode (envelope) → master GainNode →
  destination`. Master gain 0.25. Envelope: 8 ms linear attack, exponential
  decay to the note tail, explicit stop.
- Where Web Audio is unavailable, the service reports state `unavailable` and
  every play call is a no-op. It never throws.

### Cue set

`splash`, `menuTick`, `menuSelect`, `start` (slot-pull), `correct` (pitch climbs
with the combo, so a streak sounds like one), `levelUp` (arpeggio climb plus
synthesized applause, scaled by level), `fail` (descending buzzer), `pause`,
`resume`. A `DynamicsCompressor` sits before the destination so the level-up
stack is loud without clipping.

---

## 10. Timing and abort

> **Correction.** This section previously mandated rAF-driven waiting and
> forbade `setTimeout` outright. **CANON was wrong**, not the code — the code
> faithfully implemented a rule that causes a Severity-1 defect. Frame-derived
> durations quantise to the frame rate, so on a slow device the game presents a
> stretched pattern and grades against the nominal one, and no input can pass.
> See `decisions/0016`.

- **Wall-clock for logic; painted frames for anything the player must see.**
  - `wait(clock, ms, signal)` is wall-clock. Use it for pacing gaps, capture
    timeouts, and holds. It is unaffected by frame rate.
  - `waitVisible(clock, ms, signal, minFrames)` satisfies **both** a duration
    and a minimum painted-frame count, and resolves with the timestamp of the
    first painted frame. Use it for every presented cue. A stall may stretch a
    cue; it may never erase one.
- Anything **scored against a rendered performance** records the onsets it
  actually painted and scores against those. Grading a player on a schedule
  they were not shown is the defect, not the stretching.
- Wall-clock waits carry the same abort discipline rAF gave for free: the timer
  is cleared and the listener removed on abort, so nothing fires late.
- Every async method takes an `AbortSignal`.
- **One owner creates and nulls each controller.** The engine owns the phase
  controller and the per-step controller; it creates them, aborts them, and
  nulls the field. A modality never creates a controller for engine-driven
  work.
- Live controller count returns to baseline after every level. This is a
  tested invariant (50-level leak test).
- Engine events are display-only. A subscriber that throws is logged and
  skipped; it can neither end a run nor influence a fail reason
  (`decisions/0009`).

---

## 11. Build assertion

`dist/` must contain exactly one file. `dist/index.html` must contain no:

1. non-inert `src`/`href`/`srcset`/`poster`/`action`/`formaction`/`data`/`manifest`
   attribute (inert = `data:`, `blob:`, `#`, empty);
2. CSS `url(...)` that is not a `data:` URI, and no `@import`;
3. absolute `http(s)://` literal — XML namespace URIs are exempt, being
   identifiers rather than fetches;
4. protocol-relative `//host.tld/...` literal;
5. runtime network API: `fetch(`, `XMLHttpRequest`, `new WebSocket`,
   `new EventSource`, `navigator.sendBeacon`, `importScripts(`,
   `navigator.serviceWorker`.

The guard is itself tested against pass and fail fixtures so it cannot rot
into a no-op.

---

## 12. Trace algorithm — normative, written before implementation

Trace ships in Phase B. The algorithm is fixed here first, per the brief.

### Templates

Six unit glyphs, each a polyline in a normalized unit box: `line`, `vee`, `ell`,
`arc`, `zigzag`, `wave`. Direction is significant — a glyph traced backwards is
a different glyph and must fail.

### Capture

- `pointerdown` on the trace surface opens a stroke; `pointermove` appends;
  `pointerup` closes it. Pointer Events only.
- `getCoalescedEvents()` is used when available so fast strokes keep their
  samples.
- A sample is dropped if it lies within **2 CSS px** of the previous sample.
  This is the only filtering — no smoothing, no prediction.
- A stroke with fewer than 8 retained samples, or shorter than 24 px of arc
  length, is rejected as a stray tap: `{pass: false, accuracy: 0}`. It does not
  consume the `pointercancel` retry.

### Resampling

- Compute cumulative arc length along the retained polyline.
- Resample to **N = 32** points spaced equally by arc length, endpoints
  included. Resampling by arc length rather than by time makes the score
  independent of how fast the player drew.

### Normalization — screen-size independence

- Translate so the centroid of the 32 points is at the origin.
- Scale so the **root-mean-square distance** from the centroid is exactly 1.

RMS scaling is used rather than bounding-box scaling because it does not let a
single overshooting sample rescale the whole glyph. Both candidate and template
go through the identical transform, so the comparison is invariant to where on
screen the stroke was drawn and to device pixel density. See `decisions/0006`.

### Distance and accuracy

With candidate `C` and template `T`, both 32 points, both normalized:

```
meanDist = (1/32) * Σ |C_i − T_i|          // Euclidean, index-aligned
accuracy = clamp(1 − meanDist / 1.0, 0, 1)
pass     = accuracy >= 0.85
```

`D_MAX = 1.0` is expressed in RMS-normalized units: a mean per-point deviation
equal to the glyph's own RMS radius scores 0. The `0.85` threshold therefore
means "mean per-point deviation ≤ 15% of the glyph's RMS radius".

Index-aligned distance (not DTW) is deliberate: after arc-length resampling the
correspondence is already meaningful, and DTW would forgive exactly the
timing-independent shape errors the game is testing.

---

## 13. Test invariants

Normative — these must hold at every phase boundary.

- **RNG**: identical seeds produce identical sequences; distinct seeds diverge.
- **`stepsForLevel`**: 1→3, 5→7, 6→10, 10→15, 20→28.
- **`scoreStep`**: exercised for every registered modality, including the
  trace `0.85` boundary from both sides.
- **Integration, fake timers**: a full level run; wrong-step early fail;
  timeout fail; abort mid-presentation; abort mid-capture.
- **e2e, mobile viewport**: tap-to-start unlocks audio; level 1 completes;
  backgrounding mid-capture pauses and resume replays with no phantom timeout;
  a second backgrounding ends the run.
- **Leak**: after 50 simulated levels, live `AbortController` count and DOM
  listener count are back to their pre-run baseline.


---

## 14. FX budget

Decoration must never cost readability or frame rate. These are testable rules,
not aspirations (`tests/fx.test.ts`).

- The rAF loop **starts only when a particle exists** and **stops the frame
  after the last one dies**. No idle loop, ever.
- `clear()` empties the field and cancels the frame synchronously. The UI calls
  it on entering `LEVEL_SETUP` and `PRESENTING`.
- Particle count is capped at 220, and at 40 under `prefers-reduced-motion`.
- Device pixel ratio is capped at 1.5.
- **No `shadowBlur`.** It is the most expensive canvas operation on mobile and
  the first thing to remove at high particle counts.
- Intensity ladder: splash high · menu high · selection medium · correct step a
  6-particle spark · level complete high · failure brief · **presentation and
  capture: nothing**.
- CSS decorative animation is suppressed under
  `[data-state='PRESENTING']` and `[data-state='CAPTURING']`.

## 15. Rhythm

- A pattern is a list of inter-tap intervals in ms; `n` intervals means `n + 1`
  beats. Presentation length is defined by the pattern, not by the engine pace.
- Capture ends on **silence** (900 ms after the last tap), never on a fixed tap
  count — `captureStep` is given no knowledge of what was expected, and a
  fixed-count terminator silently truncates longer patterns.
- Scoring is tempo-invariant: both lists are converted to proportions of their
  own total, so the right rhythm played fast still passes. Note this is **not**
  sufficient protection against frame quantisation: onsets snap to frame
  boundaries, so some intervals grow and others shrink, and the proportions
  themselves drift. Tempo invariance rescues a uniform stretch, not a distorted
  shape — which is why rendered-onset scoring is required as well.
- The value is an object, not a bare index, so each presented step can carry
  the intervals it actually rendered. Keying by object identity keeps replays
  and interleaved sequences correct where a Map keyed by pattern index would
  collide.
- `accuracy = shape × (1 − countPenalty)`; `pass` additionally **requires the
  interval count to match exactly** (`decisions/0013`).
