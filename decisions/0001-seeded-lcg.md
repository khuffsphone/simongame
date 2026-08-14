# 0001 — Numerical Recipes LCG, warmed 4 steps

**Status:** accepted (Phase A)

## Context

CANON requires a seeded RNG with reproducible runs via `?seed=`. The brief said
"seeded LCG" and nothing more: constants, seeding, and output mapping were open.

## Decision

`state ← (Math.imul(1664525, state) + 1013904223) >>> 0`, float via
`state / 2^32`. Seed is `seed >>> 0`; string seeds hash through FNV-1a. The
generator advances **4 times** after seeding before any value is handed out.

## Why

`Math.imul` keeps the 32-bit multiply exact — plain `*` loses precision past
2^53 and silently breaks reproducibility across engines. The warm-up matters
because a bare LCG's first output is nearly a linear function of the seed:
without it, `?seed=1` and `?seed=2` open with the same colour, which looks like
a bug to anyone testing two seeds side by side.

## Tradeoff

An LCG is not cryptographic and its low bits are weak — `state & 1` alternates.
Acceptable: nothing here needs unpredictability, only reproducibility, and
`nextInt` reads from the high bits via the float conversion. If a future
modality needs bitwise randomness it must not take the low bits directly.
