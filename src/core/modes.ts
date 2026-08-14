import { stepsForLevel } from './progression';
import type { Rng } from './rng';
import { LEVEL_SCHEDULE } from './schedule';

// Game modes and difficulty — CANON §4a.

export type GameMode = 'classic' | 'mixed' | string;
export type Difficulty = 'easy' | 'normal' | 'hard';

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];

/** Presentation is *slower* on easy, so the multiplier is > 1. */
export const PRESENT_MULTIPLIER: Record<Difficulty, number> = {
  easy: 1.2,
  normal: 1,
  hard: 0.82,
};

/** Capture budget is *longer* on easy. */
export const TIMEOUT_MULTIPLIER: Record<Difficulty, number> = {
  easy: 1.4,
  normal: 1,
  hard: 0.85,
};

export interface ModeDescriptor {
  readonly id: GameMode;
  readonly label: string;
  readonly blurb: string;
}

export const BUILT_IN_MODES: readonly ModeDescriptor[] = [
  { id: 'classic', label: 'Classic Climb', blurb: 'One mode per level, then everything at once.' },
  { id: 'mixed', label: 'Mixed Type', blurb: 'Every mode, every round. Steps grow each phase.' },
];

/** Mixed phase n gives n+2 steps of every registered modality (3, then 4, then 5…). */
export function mixedStepsPerModality(level: number): number {
  return level + 2;
}

export interface ModePlan {
  /** One modality id per step, in presentation order. */
  readonly steps: readonly string[];
  readonly substituted: boolean;
  readonly scheduled: string | null;
}

/**
 * Build the per-step modality plan for a level.
 *
 * Classic follows the CANON §4 schedule. Mixed runs every registered modality
 * in registration order, `level + 2` steps each. A single-modality mode is
 * every step of that one modality, at the classic step count.
 */
export function buildModePlan(
  mode: GameMode,
  level: number,
  rng: Rng,
  availableIds: readonly string[],
): ModePlan {
  if (availableIds.length === 0) {
    throw new Error('Cannot build a plan with no registered modalities');
  }

  if (mode === 'mixed') {
    const per = mixedStepsPerModality(level);
    const steps: string[] = [];
    for (const id of availableIds) {
      for (let i = 0; i < per; i += 1) steps.push(id);
    }
    return { steps, substituted: false, scheduled: null };
  }

  const count = stepsForLevel(level);

  if (mode !== 'classic') {
    if (!availableIds.includes(mode)) {
      throw new Error(`Mode "${mode}" is not a registered modality`);
    }
    return { steps: Array.from({ length: count }, () => mode), substituted: false, scheduled: mode };
  }

  // Classic: levels 1..N walk the schedule, then every step draws from the pool.
  const pick = (): string => availableIds[rng.nextInt(availableIds.length)]!;
  if (level > LEVEL_SCHEDULE.length) {
    return { steps: Array.from({ length: count }, pick), substituted: false, scheduled: null };
  }

  const scheduled = LEVEL_SCHEDULE[level - 1]!;
  if (availableIds.includes(scheduled)) {
    return {
      steps: Array.from({ length: count }, () => scheduled),
      substituted: false,
      scheduled,
    };
  }
  return { steps: Array.from({ length: count }, pick), substituted: true, scheduled };
}
