// Difficulty curve — CANON §4.

export const BASE_PACE_MS = 800;
export const PACE_DECAY_PER_LEVEL = 0.95;

/**
 * The perception floor (decisions/0018).
 *
 * Was 250 ms. Two knobs were turning the same way: the cognitive budget grows
 * every level *and* the pace decayed toward a quarter-second, so past roughly
 * level 10 each step got both more numerous and harder to see. That is not a
 * memory game getting harder, it is a perception test replacing it — a player
 * who could hold the sequence still failed, because they never encoded it.
 *
 * Length is now the only knob that climbs without bound. 400 ms is enough to
 * recognise a pad and commit it; below that, exposure, not recall, decides.
 */
export const PACE_FLOOR_MS = 400;

function assertLevel(level: number): void {
  if (!Number.isInteger(level) || level < 1) {
    throw new RangeError(`level must be a positive integer, received ${level}`);
  }
}

/** paceForLevel(n) = max(400, round(800 * 0.95^(n - 1))) — floor binds at level 15. */
export function paceForLevel(level: number): number {
  assertLevel(level);
  const decayed = BASE_PACE_MS * PACE_DECAY_PER_LEVEL ** (level - 1);
  return Math.max(PACE_FLOOR_MS, Math.round(decayed));
}

/**
 * Dead air between presented steps (decisions/0002). Without it, a value
 * presented twice in a row reads as one long beat and cannot be reproduced.
 */
export function gapMsForPace(paceMs: number): number {
  return Math.max(100, Math.round(paceMs * 0.25));
}
