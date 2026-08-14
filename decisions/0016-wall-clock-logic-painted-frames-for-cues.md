# 0016 — Wall-clock for logic, painted frames for cues

**Status:** accepted — supersedes the timing rule in CANON §10

## Context

CANON §10, as I wrote it, said: *"All waiting is rAF-driven. No chained
`setTimeout`, anywhere, ever."* The code implemented that faithfully.

An independent UAT pass on a parallel build found the consequence. Deriving
durations from `requestAnimationFrame` quantises every interval to the frame
rate. At 10 fps nothing resolves in under 100 ms and a 250 ms beat becomes
300 ms. The presenter stretches; the scorer, comparing against nominal values,
does not. The reported result, at 8× CPU throttle:

```
pattern the game intended : [220, 440, 220]
pattern actually shown    : [1126, 992, 1295]
player copies what he saw -> REJECTED
```

No input can pass. The run ends on a pattern the player was never shown. That
is a correctness bug wearing a performance bug's clothes, and it appears only
on slow devices — which is to say, only for other people.

MODESHIFT's proportional rhythm scoring made it *less* exposed than an absolute
comparison, but not safe: quantisation snaps onsets to frame boundaries, so
intervals grow *and shrink* and the proportions drift. `tests/timing.test.ts`
measures a >0.05 proportional drift at 100 ms frames, enough to fail scoring.
Tempo invariance rescues a uniform stretch, not a distorted shape.

## Decision

Split the concern rather than swap one universal rule for another:

- `wait(clock, ms, signal)` — wall-clock, for game logic. Pacing gaps, capture
  timeouts, holds.
- `waitVisible(clock, ms, signal, minFrames)` — satisfies both a duration and a
  minimum painted-frame count, and returns the timestamp of the first painted
  frame. For every cue the player must perceive.
- Rhythm records its rendered onsets and scores against those, keyed by value
  object identity so replays and interleaved sequences stay correct.

`Clock` grew `now`, `timeout`, and `clearTimer` alongside `frame`/`cancel`, so
the whole model stays injectable and the fake clocks in tests can drive wall
time and frame time independently — which is exactly what the regression test
needs.

## Why not simply move everything to setTimeout

That is the overcorrection, and it reintroduces the mirror defect. A cue driven
purely off the wall clock can be swallowed whole by a stalled frame: the game
asks the player to reproduce something that was never painted. rAF is not wrong
for animation; it is wrong for logic. `waitVisible` keeps both guarantees by
requiring both conditions.

## Tradeoff

rAF-based waits cancelled cleanly for free — cancel the frame and nothing
survives. Wall-clock waits must clear their timer explicitly on abort, and a
missed `clearTimer` is a phantom timeout, the exact class of bug the pause path
was built to prevent. That discipline is now the price of correct timing, and
it is carried in `wait`/`waitVisible` rather than at each call site.

`waitVisible` also makes cues *longer* than requested on a slow device, because
it will not resolve before `minFrames` have painted. That is deliberate: a
late cue is honest, an invisible one is not. The cost is that a heavily loaded
device plays a slower game rather than an unwinnable one.
