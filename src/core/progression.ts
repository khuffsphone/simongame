// Difficulty curve — CANON §4.

export const BASE_PACE_MS = 800;
export const PACE_DECAY_PER_LEVEL = 0.95;
export const PACE_FLOOR_MS = 250;

function assertLevel(level: number): void {
  if (!Number.isInteger(level) || level < 1) {
    throw new RangeError(`level must be a positive integer, received ${level}`);
  }
}

/** stepsForLevel(n) = n <= 5 ? n + 2 : floor(n * 1.25) + 3 */
export function stepsForLevel(level: number): number {
  assertLevel(level);
  return level <= 5 ? level + 2 : Math.floor(level * 1.25) + 3;
}

/** paceForLevel(n) = max(250, round(800 * 0.95^(n - 1))) — floor binds at level 34. */
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
