// Curriculum and cognitive budget — CANON §4.
//
// Two problems this file exists to fix, both measured in the shipped build:
//
// 1. **The cliff.** Levels 1-5 were one modality each, then level 6 dumped
//    every modality at 10 steps — including rhythm, which the old schedule
//    never introduced at all, so it first appeared interleaved and unannounced.
//    That is a wall, not an escalation. The ladder below teaches, then
//    integrates, then teaches again.
//
// 2. **Step count is not difficulty.** Thirteen colour taps and thirteen traced
//    glyphs are not the same task. Counting steps meant a trace level demanded
//    thirteen full drawings. Levels are now generated against a *cognitive
//    budget*, so a level costs what it costs regardless of which modalities
//    fill it.

/** Relative cognitive cost of one step, per modality. Data, not constants. */
export const COGNITIVE_COST: Readonly<Record<string, number>> = {
  color: 1.0,
  number: 1.0,
  shape: 1.1,
  sound: 1.25,
  rhythm: 2.0,
  trace: 2.5,
};

export const DEFAULT_COST = 1.0;

export function costOf(modalityId: string): number {
  return COGNITIVE_COST[modalityId] ?? DEFAULT_COST;
}

/**
 * Classic Circuit: teach, integrate, teach, integrate.
 *
 * Each entry is the pool a level draws from. A single-entry pool is a teaching
 * level; a multi-entry pool integrates what has been taught so far.
 */
export const CLASSIC_LADDER: readonly (readonly string[])[] = [
  ['color'], // 1  teach colour
  ['number'], // 2  teach number
  ['color', 'number'], // 3  integrate
  ['shape'], // 4  teach shape
  ['color', 'number', 'shape'], // 5  integrate
  ['sound'], // 6  teach sound
  ['color', 'number', 'shape', 'sound'], // 7  integrate
  ['trace'], // 8  teach trace
  ['rhythm'], // 9  teach rhythm
  ['color', 'number', 'shape', 'sound', 'trace', 'rhythm'], // 10 everything
];

export const CLASSIC_LEVELS = CLASSIC_LADDER.length;

/**
 * The pool for a level. Past the authored ladder, Classic keeps drawing from
 * everything rather than ending, so a strong player has somewhere to go.
 */
export function classicPoolFor(level: number): readonly string[] {
  const index = Math.min(level, CLASSIC_LEVELS) - 1;
  return CLASSIC_LADDER[index]!;
}

/**
 * Cognitive budget for a level, in cost units.
 *
 * Deliberately identical to the old step count so the difficulty curve players
 * already know is preserved: a colour level (cost 1.0/step) generates exactly
 * the same number of steps it always did. Only levels containing expensive
 * modalities get shorter, which is the point.
 */
export function budgetForLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1) {
    throw new RangeError(`level must be a positive integer, received ${level}`);
  }
  return level <= 5 ? level + 2 : Math.floor(level * 1.25) + 3;
}

/** A level always has at least this many steps, however expensive the pool. */
export const MIN_STEPS = 2;
/** And never more than this, however cheap — long levels stop being memory. */
export const MAX_STEPS = 40;

export interface GeneratedLevel {
  readonly steps: readonly string[];
  readonly budget: number;
  readonly spent: number;
}

/**
 * Fill a level up to its budget.
 *
 * Draws are deterministic under a fixed seed. A modality whose cost exceeds the
 * remaining budget is skipped rather than truncating the level, so a cheap
 * modality can still use up the tail — but the loop gives up once nothing in
 * the pool fits, which is what keeps trace levels short.
 */
export function generateLevel(
  pool: readonly string[],
  budget: number,
  nextIndex: (bound: number) => number,
): GeneratedLevel {
  if (pool.length === 0) throw new Error('Cannot generate a level from an empty pool');

  const steps: string[] = [];
  let spent = 0;
  const cheapest = Math.min(...pool.map(costOf));

  while (steps.length < MAX_STEPS && budget - spent >= cheapest) {
    const affordable = pool.filter((id) => costOf(id) <= budget - spent);
    if (affordable.length === 0) break;
    const pick = affordable[nextIndex(affordable.length)]!;
    steps.push(pick);
    spent += costOf(pick);
  }

  // A pool of nothing but expensive modalities can still owe the player a
  // round: guarantee a floor rather than shipping a zero-step level.
  while (steps.length < MIN_STEPS) {
    const pick = pool[nextIndex(pool.length)]!;
    steps.push(pick);
    spent += costOf(pick);
  }

  return { steps, budget, spent };
}
