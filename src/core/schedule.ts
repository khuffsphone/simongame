import type { Rng } from './rng';

// Level schedule — CANON §4. Data, not branching.

export const LEVEL_SCHEDULE: readonly string[] = ['color', 'number', 'shape', 'sound', 'trace'];

/** From this level on, every step draws independently from the registered pool. */
export const INTERLEAVE_FROM_LEVEL = LEVEL_SCHEDULE.length + 1;

export interface ResolvedPlan {
  /** One modality id per step. */
  readonly steps: readonly string[];
  /** The id the schedule asked for, or null on interleaved levels. */
  readonly scheduled: string | null;
  /** True when `scheduled` was not registered and had to be substituted. */
  readonly substituted: boolean;
}

/**
 * Resolve which modality drives each step of a level.
 *
 * A scheduled modality that is not registered is substituted from the
 * registered pool (decisions/0004), which is what keeps levels 3-5 playable
 * while shape, sound, and trace are unbuilt. Substitution consumes RNG draws
 * from the run's generator, so a `?seed=` run stays reproducible.
 */
export function resolveLevelPlan(
  level: number,
  stepCount: number,
  rng: Rng,
  availableIds: readonly string[],
): ResolvedPlan {
  if (!Number.isInteger(level) || level < 1) {
    throw new RangeError(`level must be a positive integer, received ${level}`);
  }
  if (!Number.isInteger(stepCount) || stepCount < 1) {
    throw new RangeError(`stepCount must be a positive integer, received ${stepCount}`);
  }
  if (availableIds.length === 0) {
    throw new Error('Cannot resolve a level plan with no registered modalities');
  }

  const pick = (): string => availableIds[rng.nextInt(availableIds.length)]!;

  if (level >= INTERLEAVE_FROM_LEVEL) {
    return {
      steps: Array.from({ length: stepCount }, pick),
      scheduled: null,
      substituted: false,
    };
  }

  const scheduled = LEVEL_SCHEDULE[level - 1]!;
  if (availableIds.includes(scheduled)) {
    return {
      steps: Array.from({ length: stepCount }, () => scheduled),
      scheduled,
      substituted: false,
    };
  }

  return {
    steps: Array.from({ length: stepCount }, pick),
    scheduled,
    substituted: true,
  };
}
