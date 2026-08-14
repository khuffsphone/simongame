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

Rules:

- Every async method takes an `AbortSignal` and rejects with a `DOMException`
  of name `AbortError` when it fires. No exceptions.
- Modalities receive services by injection (`audio`, `clock`, `reducedMotion`).
  No globals, no reaching for `document` outside their own container.
- `scoreStep` must be pure and synchronous so it is unit-testable without DOM.

---

## 4. Progression

### Steps per level — normative

```
stepsForLevel(n) = n <= 5 ? n + 2 : floor(n * 1.25) + 3
```

| n | 1 | 5 | 6 | 10 | 20 |
| --- | --- | --- | --- | --- | --- |
| `stepsForLevel(n)` | 3 | 7 | 10 | 15 | 28 |

### Pacing — normative

Global pace starts at 800 ms/step and drops 5% per level, with a 250 ms floor:

```
paceForLevel(n) = max(250, round(800 * 0.95^(n - 1)))
```

| n | 1 | 2 | 5 | 10 | 20 | 23 | 24 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `paceForLevel(n)` | 800 | 760 | 652 | 504 | 302 | 259 | 250 |

The floor first binds at level 24.

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

### Level schedule — data-driven

| Level | Modality |
| --- | --- |
| 1 | `color` |
| 2 | `number` |
| 3 | `shape` |
| 4 | `sound` |
| 5 | `trace` |
| 6+ | interleaved: each step draws uniformly from all registered modalities |

The schedule is data (`src/core/schedule.ts`), not branching. Resolution runs
against the registry: a scheduled modality that is not registered is
substituted from the registered pool, deterministically, via the run's RNG.
See `decisions/0004`. This is what keeps levels 3–5 playable while shape,
sound, and trace are still unbuilt.

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

- **Pointer Events only.** No mouse or touch event handlers anywhere.
- Discrete input commits on `pointerdown`, not `pointerup` or `click`.
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

---

## 10. Timing and abort

- All waiting is **rAF-driven**. No chained `setTimeout`, anywhere, ever.
- Elapsed time comes from the timestamp rAF passes to its callback, not from a
  separate clock read.
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

Four unit glyphs, each a polyline in a normalized unit box: `line` (left to
right), `vee` (down-right then up-right), `ell` (down then right), `arc` (a
half-circle, clockwise from the top). Direction is significant — a glyph
traced backwards is a different glyph and must fail.

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
