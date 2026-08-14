# 0019 — Adaptive assist moves time, and only time

## Status

Accepted. Adds CANON §4b.

## Context

`Persistence.recordScore(modalityId, pass, accuracy)` has been called on every
scored step since the first build. `modalityAccuracy` is written to localStorage,
survives reloads, and is read by nothing. It is a measurement with no consumer —
the most expensive kind of dead code, because it looks like a feature.

Meanwhile the game has one difficulty dial (easy/normal/hard) that applies
globally. A player who is fine at colour and hopeless at trace has two bad
options: play on normal and fail every trace level, or drop to easy and find
colour boring. The data to fix that has been sitting in localStorage the whole
time.

## Decision

Read the record. Scale **presentation duration and capture timeout**, per
modality, and nothing else.

```
scale(rate) = rate < 0.60 ? 1 + (0.60 - rate)/0.60 * 0.35   // up to 1.35x
            : rate > 0.90 ? 1 - (rate - 0.90)/0.10 * 0.10   // down to 0.90x
            : 1
```

Six constraints make this safe rather than merely clever:

1. **8-attempt minimum.** Below that, scale is exactly 1. Two bad levels are not
   a diagnosis, and an assist triggered by noise teaches the player that the
   game is arbitrary.

2. **The record forgets.** `Persistence` caps effective sample size at 40
   attempts by decaying the totals before each new one — an exponential moving
   average with no schema change and no timestamp array. Without it, lifetime
   totals mean a player who was bad at trace 500 attempts ago carries the assist
   forever and *cannot earn their way out*, because a hundred recent passes
   barely move a lifetime mean. The test for this is written as the thing a
   player would notice: after 200 failures then 60 successes, the assist is gone.

3. **Disclosed, every level, by name.** The seed footer reads
   `seed 12345 · classic · normal · assist: Trace`, and `level` events carry
   `assisted`. Silent difficulty adjustment is the mechanic that makes players
   distrust a game — if the number went up because the game got easier and did
   not say so, the number is worthless.

4. **Pressure never shortens the answer clock.** A solved modality is *shown* for
   less time; the player still gets the full window to answer. Shortening the
   fuse for someone who keeps getting it right is punishing competence.

5. **The perception floor still binds.** The 0.9× is applied to
   `max(pace, minPresentMs)` and then clamped back to `minPresentMs`. Assist
   cannot undo decisions/0018.

6. **Fixed rulesets refuse it outright.** `adaptivityAllowed(mode)` is consulted
   rather than a default that can be forgotten. `daily` is in
   `FIXED_RULESET_MODES` today even though the Daily Challenge does not exist —
   a forward declaration, so the gate is already there and already tested when
   Packet 4 adds the mode.

The profile is built once per run from the record as it stood at the start.
Rebuilding it mid-run would change the rules of a level while it was being
played.

## Why time and not difficulty

Falsifiability. If assist changed how many steps a level had, two players who
both reached "level 12" would have played different games and the number would
mean nothing — not to a leaderboard, not to the player's own sense of progress.
If it changed the pass threshold, a trace that missed would be recorded as a
trace that hit, and the accuracy record feeding the assist would corrupt itself
in a loop.

Moving only *time* keeps the task identical. Same sequence, same length, same
scoring — the player is simply given room to do it. That is the same lever the
difficulty setting already pulls, aimed at the one modality that needs it.
`tests/engine.test.ts` asserts the invariant directly: same seed, same level,
same presented sequence, same step count, different durations.

## Consequences

- The assist is visible in the seed footer, which is also where a screenshot of
  a run shows it. A run with an assist cannot be passed off as one without.
- `ModalityRecord.attempts` is now fractional once past 40. Nothing formats it
  for display, so this is invisible; if a stats screen ever does, it must round.
- Existing v2 saves work unchanged — the decay applies from the next write.
- Not built: a player-facing switch to turn the assist off. The `adaptive` option
  exists on `createApp` and is wired; there is no Settings panel to expose it
  yet. That belongs to Packet 1, and is recorded in KNOWN_LIMITATIONS.

## Alternatives rejected

- **Adjust the cognitive budget.** Shorter levels for struggling players. Breaks
  cross-player comparability of the level number, which is the game's only score.
- **Adjust the pass threshold.** Corrupts the record that drives the adaptation.
- **A rolling array of the last N results.** Same behaviour as the EMA, plus a
  schema migration and an unbounded-growth bug waiting to happen.
- **Adapt within a run, step to step.** Reactive enough to feel like the game is
  reading your mind, and it makes a level's difficulty depend on when inside it
  you struggled. Per-run is the honest granularity.
