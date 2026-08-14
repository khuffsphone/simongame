# Known limitations

Scope status as of run `20260814T182208Z-9146ace`. The gauntlet spec defines eight packets;
this run completed Packet 0 and the core of Packet 2. Everything below is
**not built**, and is listed so nothing reads as shipped that is not.

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

## Product defects verified in code but not yet fixed

- **Pace floor vs. length.** `paceForLevel` decays to 250 ms while step counts
  grow, so exposure shrinks as length grows. Past roughly level 10 this tests
  perception more than recall. Raising the floor and growing length instead is
  the recommended change; not made.
- **`modalityAccuracy` is written and never read.** Every step records
  per-modality accuracy to localStorage. Nothing consumes it. Adaptive
  difficulty is one read away and is not implemented.
- **Failure reveals nothing.** The fail overlay says "Wrong step." and does not
  show what the correct answer was — the most frustrating possible ending.
- **No reason to return.** No daily seed, no meta-progression, no persistence
  of anything beyond best level and per-mode best.
- **Classic ends at ten authored levels.** Levels 11+ keep drawing from the
  full pool rather than escalating pedagogy (`decisions/0017`).

## UNVERIFIED

- **Real-device FPS and interactive UAT.** All numbers here are headless
  Chromium under CDP CPU throttling. No physical device was used.
- **Audible output.** Nothing listens. Audio is verified only as far as "an
  AudioContext was constructed once, at the right moment, reporting running".
- **Haptics.** `navigator.vibrate` is unimplemented in headless Chromium, and
  unimplemented in iOS Safari at all. Call sites are exercised; no vibration
  was observed. On iOS this feature cannot work and the substitute would be
  audio-visual emphasis.
- **iOS Safari, entirely.** `100dvh`, `env(safe-area-inset-*)` and Web Audio
  unlock are exactly where iOS differs.
- **Real touch hardware.** Pixel 5 emulation is not a finger.
- **Landscape orientation.** Screenshots are portrait only.
- **Long-session endurance beyond the 50-level simulated leak check.**
