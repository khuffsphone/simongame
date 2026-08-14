# UAT report — run `20260814T194611Z-affcb6d`

Artifact: `MODESHIFT_ANDROID_RC_20260814T194611Z_affcb6d.html`
SHA-256: `5c986de67f825cc8356d8453c5c9628eba5774074a3159052ec12916aae0c67b`
Size: 55,576 bytes
Commit: `affcb6d`
Target platform: **Android, Chrome** (`decisions/0021`)
Ruleset version: 1 · Content-pack version: none · Persistence version: 2

Supersedes the report for `20260814T182208Z-9146ace`. Two corrections to that
report are recorded at the bottom of this file.

## Commands run

| Command | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm test` | 219 passed, 14 files |
| `npm run build` | 55,576 bytes; self-contained assertion OK |
| `npx playwright test --workers=1` | 44 passed |
| frame gate @ 4× | all phases PASS |
| frame gate @ 8× | all phases PASS |
| frame gate @ 16× | 3 phases FAIL — see below |
| frame gate @ 24× | 3 phases FAIL — see below |

## Performance — where it actually breaks

390×844 DPR 2, CDP CPU throttling, budget 20 ms p95.

| Phase | 4× | 8× | 16× | 24× |
| --- | --- | --- | --- | --- |
| splash idle | 16.8 | 16.8 | 16.7 | 16.8 |
| menu | 16.7 | 16.8 | 16.7 | 16.7 |
| presenting | 16.7 | 16.7 | **33.3** | **50.0** |
| jackpot (particles live) | 16.8 | 16.7 | **50.0** | **83.3** |
| post-jackpot recovery | 16.7 | 16.8 | **33.3** | **33.4** |

p95 in ms; bold is over budget.

**The build holds 60 fps through 8× and breaks at 16×.** The jackpot phase
breaks first and hardest — 26.2 ms mean, 50 ms p95, 83.3 ms worst at 16× —
while the idle phases are still clean at 24×. That is the headroom number:
roughly a 2× polish budget over the 8× rung before the celebration starts
dropping frames on the beat the player most needs to see.

### Correction to the previous report's performance section

The previous run reported the jackpot phase at 16.7 ms p95 at both 4× and 8×
and read that as headroom. **The phase was not measuring particles.** Probing
the FX canvas for non-transparent pixels across that phase's window shows
particles alive from 40 ms to 512 ms after the level clears — 4 lit samples out
of 23 — while the window sampled 3500 ms. About 85% of the frames in the
"jackpot" phase were idle frames, so p95 sat on an idle frame and reported the
vsync ceiling no matter what the burst cost.

The window is now 900 ms, sized to the measured particle lifetime, and a
separate `post-jackpot recovery` phase covers the tail. With a window that
contains the effect, the numbers above are about the effect. This is the same
idle-measurement trap flagged after the last run, one level down: the phase had
the right name and the wrong content. The rule and the measurement are now in
`.claude/skills/gauntlet-loop/references/gates.md`.

## Test counts

| Category | Count |
| --- | --- |
| Unit + integration (Vitest) | 219 |
| Browser e2e (Playwright) | 44 |
| Frame-budget gate phases | 20 (5 phases × 4 throttles) |
| Offline artifact replay | 1 (`e2e/artifact.spec.ts`) |
| Leak / endurance | 1 (50 simulated levels) |
| Content validation | 0 — no content pack exists yet |
| Accessibility | partial — activation paths and 44 px targets only |

New: 18 adaptive-assist unit tests, 8 engine integration tests for the assist,
18 reveal-wording unit tests, **39 haptics unit tests**, 5 e2e adaptive tests
that seed the real save slot, 4 e2e reveal tests that lose real runs and read
the overlay, **9 e2e haptics tests that probe the shipped bundle for exact
vibration patterns at exact moments**, and 3 progression tests pinning the new
pace floor.

## What changed since `9146ace`

| Commit | Change |
| --- | --- |
| `801c57c` | Pace floor 250 → 400 ms; length is the only unbounded difficulty knob (`decisions/0018`) |
| `e61519d` | `modalityAccuracy` is read: per-modality adaptive assist, disclosed by name (`decisions/0019`) |
| `b80e729` | A run may not end without revealing its answer (`decisions/0020`) |
| `fd4f6fb` | Frame gate: the jackpot phase was 85% idle frames (below) |
| `affcb6d` | Android declared the target; haptics implemented against real hardware constraints (`decisions/0021`) |

## Correction to the previous report's command table

The previous report recorded `npm run typecheck | exit 0`. That was wrong: an
unused import in `e2e/modalities.spec.ts` landed in commit `913cc72` after the
typecheck was run, and typecheck was red at that commit. Verified by checking
out `913cc72` and re-running. Fixed in `801c57c`; exit 0 above was re-run
against this commit.

## Open defects

See `docs/KNOWN_LIMITATIONS.md`. No Severity 0 or 1 defect is known. The three
product defects listed in the previous run are fixed; the gaps those fixes
introduced are listed rather than left implicit. Unbuilt packets are scope, not
defects.

## Haptics — what is and is not proven

Headless Chromium does not implement `navigator.vibrate`, so **no phone has
buzzed**. `e2e/haptics.spec.ts` installs a probe on the shipped bundle and
asserts the rest:

| Assertion | Result |
| --- | --- |
| Nothing dispatched before first interaction | pass |
| Entry gesture → `[20]` | pass |
| Mode select → `[20]`, start → `[30, 40, 60]` | pass |
| Correct step → `[25]`, a single pulse | pass |
| Personal best → `[40,30,60,30,90,40,140]`, distinct from an ordinary clear | pass |
| Ordinary clear → `[40,30,60,30,90]` | pass |
| Fail → `[90, 50, 140]` | pass |
| Leaving a run cancels with `[]` | pass |
| No pulse below 20 ms anywhere in a full playthrough | pass |

The 20 ms floor and the 25 ms step pulse are **reasoned from ERM motor spin-up
behaviour, not measured on hardware**. A device pass should tune them;
`src/ui/haptics.ts` holds the single pattern table.

## Still UNVERIFIED

No physical device; nothing listens to the audio; no real touch hardware;
portrait only. iOS Safari is no longer listed — it is out of scope, not
untested risk (`decisions/0021`).
