# Known limitations

Scope status as of `b80e729`. The gauntlet spec defines eight packets; the work
so far covers Packet 0, the core of Packet 2, and three product defects fixed
on top of it. Everything below is **not built**, and is listed so nothing reads
as shipped that is not.

## Not implemented (gauntlet packets)

| Packet | Item | Status |
| --- | --- | --- |
| 1 | Transient-effect manager (single cancel/clear owner) | not built |
| 1 | Four-tier reward hierarchy (full jackpot every level still) | not built |
| 1 | Audio scene mixer, buses, ambient suppression in Sound/Rhythm | not built |
| 1 | Settings panel, Comfort Mode, encouragement styles | not built |
| 1 | HUD simplification / pause details split | not built |
| 2 | Focus Drill, Daily Challenge, Risk Run modes | not built |
| 2 | Run-record score identity, ruleset-scoped high scores | not built |
| 2 | Grade semantics (no per-tap PERFECT) | not built |
| 2 | Persistence v3 schema + v1/v2 migration | not built |
| 3 | Learning engine, content schema, 24-scenario pack | not built |
| 4 | Coins, artifacts, cabinet, high-score history | not built |
| 5 | Companion, Decision Log, challenge sharing | not built |
| 6 | Second theme, transition audit, 5-viewport UAT matrix | partial (screenshots only) |
| 7 | Full release matrix | partial |

Persistence remains at schema v2. No migration to a new schema was written, so
no migration risk was introduced.

## Product defects — fixed

- ~~**Pace floor vs. length.**~~ Fixed in `801c57c`. Floor raised to 400 ms,
  binding at level 15; length is now the only unbounded difficulty knob and
  `tests/progression.test.ts` asserts it. `decisions/0018`.
- ~~**`modalityAccuracy` is written and never read.**~~ Fixed in `e61519d`.
  Per-modality adaptive assist scales presentation and capture time only,
  disclosed by name every level. `decisions/0019`.
- ~~**Failure reveals nothing.**~~ Fixed in `b80e729`. The overlay names the
  answer and what the player gave. `decisions/0020`.

## Product defects verified in code but not yet fixed

- **No reason to return.** No daily seed, no meta-progression, no persistence
  of anything beyond best level, per-mode best, and the accuracy record.
- **Classic ends at ten authored levels.** Levels 11+ keep drawing from the
  full pool rather than escalating pedagogy (`decisions/0017`).
- **No earned mulligan.** One focus-loss replay per run and one pointercancel
  retry per level exist; there is nothing the player can *earn*.
- **Android back exits the page mid-run.** No `history` entry, no `popstate`
  handler, so a back swipe during a level leaves the game and loses the run.
  On the target platform this is a common accidental gesture and it is the top
  outstanding Android defect. Fix is a history entry per screen plus mapping
  back to pause/menu; it touches the screen router and the overlay guard, so it
  was not done in passing (`decisions/0021`).

## Gaps introduced by the fixes above, and deliberately left open

- **The assist has no off switch a player can reach.** `createApp({adaptive:
  false})` is wired and tested, and `adaptivityAllowed(mode)` refuses fixed
  rulesets, but there is no Settings panel to expose either. Packet 1.
  `decisions/0019`.
- **Difficulty stops climbing at level 30 for an all-cheap pool**, where the
  budget hits its 40-step cap and the pace floor has already bound. Accepted
  rather than fixed: 40 items is far beyond human span and no measured run has
  approached it. Recorded in CANON §4 rather than left as a surprise.
- **The reveal is text, not a replay.** Re-showing the pad flash or redrawing
  the glyph would be better than words, especially for trace. It needs a
  modality to render while deactivated and the overlay to sit behind rather
  than over the stage — a Packet 1 layout change. `decisions/0020`.
- **`ModalityRecord.attempts` is fractional past 40 attempts** (the recency
  EMA). Nothing formats it for display today; a future stats screen must round.

## Out of scope

- **iOS Safari.** Android Chrome is the target (`decisions/0021`). iOS is not a
  coverage gap; anything that works on Android and not on iOS is out of scope
  until the target changes.

## UNVERIFIED

- **Real-device FPS and interactive UAT.** All numbers here are headless
  Chromium under CDP CPU throttling. No physical device was used.
- **Audible output.** Nothing listens. Audio is verified only as far as "an
  AudioContext was constructed once, at the right moment, reporting running".
- **Haptics, as felt output.** `navigator.vibrate` is unimplemented in headless
  Chromium, so no phone has buzzed. What *is* asserted, by `e2e/haptics.spec.ts`
  against the shipped bundle: the build reaches the vibration API with the exact
  expected pattern at each of tap / select / start / step / levelUp / bestRun /
  fail, emits nothing before first interaction, cancels on leaving a run, and
  never dispatches a pulse under 20 ms. The remaining unknown is whether the
  chosen durations feel right on real hardware.
- **The 20 ms pulse floor and 25 ms step cue are reasoned, not measured.** They
  come from ERM motor spin-up behaviour, not from a device. A hardware pass
  should tune them; `src/ui/haptics.ts` has the single pattern table.
- **Real touch hardware.** Pixel 5 emulation is not a finger.
- **Landscape orientation.** Screenshots are portrait only.
- **Long-session endurance beyond the 50-level simulated leak check.**
