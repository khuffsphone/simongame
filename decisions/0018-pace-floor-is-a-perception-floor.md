# 0018 — The pace floor is a perception floor: 250 ms → 400 ms

## Status

Accepted. Supersedes the pacing table in CANON §4.

## Context

`paceForLevel(n) = max(250, round(800 * 0.95^(n - 1)))` and
`budgetForLevel(n) = floor(n * 1.25) + 3` were both in the difficulty curve, and
both made the level harder. Nothing in CANON said which one was *the* difficulty
knob, so both climbed.

The measured consequence: at level 10 a colour level is 15 steps at 504 ms; at
level 20 it is 28 steps at 302 ms; at level 24 it is 33 steps at 250 ms. Sequence
length nearly doubles while the time to see each item almost halves. Past roughly
level 10 the binding constraint stops being "can you hold 20 items" and becomes
"can you read a pad in a quarter second". Those are different games, and only one
of them is the game MODESHIFT says it is.

250 ms is below the point where recognition plus encoding is comfortable for a
glyph or a shape, and it applies on top of a gap that has also collapsed to its
own 100 ms floor. A player who could reproduce the sequence still fails, because
they never encoded it. That failure is indistinguishable, from inside the game,
from a memory failure — which makes it the worst kind: the player cannot tell
what to practise.

## Decision

Raise `PACE_FLOOR_MS` to **400**. The floor now first binds at level 15 rather
than level 24.

**Length is the only difficulty knob that climbs without bound.** Once the pace
floor binds, pace is constant and only the cognitive budget moves. This is not a
comment; `tests/progression.test.ts` asserts it for every level from 15 to 30.

## Consequences

- Levels 15+ are meaningfully easier to *see* and no easier to *remember*. The
  curve past 15 is pure length, which is what a memory game should escalate.
- Levels 1–14 are unchanged: the decay is identical, only the clamp moved.
- Sound is unaffected — `minPresentMs = 520` already overrode the floor for every
  level past 12. Colour, number and shape are where this is felt.
- The budget's own `MAX_STEPS = 40` cap binds at level 30 for an all-cheap pool.
  Past level 30, nothing increases at all. Accepted rather than fixed: 40 items
  is already far beyond human span, and no measured run has come close. Recorded
  in CANON §4 rather than left as a surprise.
- `stepsForLevel` is deleted. It was byte-identical to `budgetForLevel` and read
  by nothing but its own tests — two formulas for one curve is how the curve
  drifts. `budgetForLevel` in `src/content/curriculum.ts` is the single one.

## Alternatives rejected

- **Keep 250 ms, shrink length.** Inverts the genre. Simon is long sequences at a
  legible pace, not short sequences at a subliminal one.
- **Floor the *product* (pace × steps) instead.** Keeps total exposure constant,
  which sounds principled but means level 30 shows 40 items in the same wall time
  as level 5 shows 7 — the per-item pace falls off a cliff to satisfy the
  invariant. Worse than what it replaces.
- **Let the player choose the pace.** That is a difficulty setting, and there
  already is one. Difficulty scales presentation by 1.2/1.0/0.82 *before* the
  floor, which is the right place for player preference to act.
