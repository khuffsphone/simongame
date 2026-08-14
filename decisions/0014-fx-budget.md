# 0014 — FX run on a budget, and stop when idle

**Status:** accepted (Phase C)

## Context

The brief demands a casino feel and simultaneously forbids visual noise during
the sequence and continuous animation loops. The reference builds satisfy the
first and violate both of the others: one runs `requestAnimationFrame`
unconditionally forever, at 60 fps, with zero particles on screen; both draw
sparks with `shadowBlur`; one caps device pixel ratio at 2 and the particle
pool at 900.

## Decision

Five rules, each with a test in `tests/fx.test.ts`:

1. the loop starts on the first particle and stops the frame after the last one
   dies (`isLooping` is public so the test can assert it, not infer it);
2. `clear()` empties the field and cancels the pending frame synchronously; the
   UI calls it entering `LEVEL_SETUP` and `PRESENTING`;
3. particle cap 220, dropping to 40 under `prefers-reduced-motion`;
4. device pixel ratio capped at 1.5;
5. no `shadowBlur` anywhere — asserted by recording property writes on a proxied
   canvas context.

## Why

Each of these is the kind of rule that rots silently: nothing visibly breaks
when an idle loop burns battery, and nobody notices a 900-particle cap until a
mid-range phone drops frames during a jackpot. Making `isLooping` and
`particleCount` public turns them from comments into assertions.

`shadowBlur` earns its own rule because it is not a small cost — it forces a
separate blur pass per draw call, and it is the single easiest thing to reach
for when a particle looks flat.

## Tradeoff

No `shadowBlur` means the sparks are flat discs rather than glowing ones, and
the celebration reads slightly cheaper than the reference builds at the same
particle count. Compensating with more particles would spend the saving. The
glow that remains is CSS on a handful of static elements, where it costs one
composite rather than one blur per particle per frame.

The 1.5 DPR cap makes confetti edges visibly softer on a 3x phone screen. That
is deliberate: the particles are in motion and blurred by that motion anyway.
