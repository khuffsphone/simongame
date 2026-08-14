import {
  CLASSIC_LEVELS,
  budgetForLevel,
  classicPoolFor,
  generateLevel,
} from '../content/curriculum';
import type { Rng } from './rng';

// Game modes and difficulty — CANON §4a.

export type GameMode = 'classic' | 'quickmix' | 'marathon' | string;
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

/**
 * Difficulty scales the cognitive budget too, but never the perception floor —
 * a harder level is longer, not dimmer or faster than the eye can follow.
 */
export const BUDGET_MULTIPLIER: Record<Difficulty, number> = {
  easy: 0.85,
  normal: 1,
  hard: 1.2,
};

export interface ModeDescriptor {
  readonly id: GameMode;
  readonly label: string;
  readonly blurb: string;
}

export const BUILT_IN_MODES: readonly ModeDescriptor[] = [
  {
    id: 'classic',
    label: 'Classic Circuit',
    blurb: 'Ten levels. Each mode taught, then integrated.',
  },
  { id: 'quickmix', label: 'Quick Mix', blurb: 'Short interleaved run. Two to five minutes.' },
  { id: 'marathon', label: 'Marathon', blurb: 'Every mode, every phase. Goes long on purpose.' },
];

/** Quick Mix keeps rounds short by capping the budget however far you climb. */
export const QUICK_MIX_MAX_BUDGET = 12;

/** Marathon phase n gives n+2 steps of every registered modality. */
export function marathonStepsPerModality(level: number): number {
  return level + 2;
}

export interface ModePlan {
  /** One modality id per step, in presentation order. */
  readonly steps: readonly string[];
  readonly substituted: boolean;
  readonly scheduled: string | null;
  /** Cognitive budget this level was generated against, for the HUD and tests. */
  readonly budget: number;
  readonly spent: number;
}

/**
 * Build the per-step modality plan for a level.
 *
 * Classic walks the teaching ladder. Quick Mix interleaves everything against a
 * capped budget. Marathon keeps the old every-modality-every-phase behaviour
 * for players who want it — renamed, because it was never a sensible default.
 * A single-modality mode is that modality, budgeted, which is what stops a
 * trace round demanding thirteen drawings.
 */
export function buildModePlan(
  mode: GameMode,
  level: number,
  rng: Rng,
  availableIds: readonly string[],
  difficulty: Difficulty = 'normal',
): ModePlan {
  if (availableIds.length === 0) {
    throw new Error('Cannot build a plan with no registered modalities');
  }
  const pick = (bound: number): number => rng.nextInt(bound);

  if (mode === 'marathon') {
    const per = marathonStepsPerModality(level);
    const steps: string[] = [];
    for (const id of availableIds) {
      for (let i = 0; i < per; i += 1) steps.push(id);
    }
    return { steps, substituted: false, scheduled: null, budget: steps.length, spent: steps.length };
  }

  const rawBudget = budgetForLevel(level) * BUDGET_MULTIPLIER[difficulty];

  if (mode === 'quickmix') {
    const budget = Math.min(QUICK_MIX_MAX_BUDGET, rawBudget);
    const generated = generateLevel(availableIds, budget, pick);
    return {
      steps: generated.steps,
      substituted: false,
      scheduled: null,
      budget,
      spent: generated.spent,
    };
  }

  if (mode !== 'classic') {
    if (!availableIds.includes(mode)) {
      throw new Error(`Mode "${mode}" is not a registered modality`);
    }
    const generated = generateLevel([mode], rawBudget, pick);
    return {
      steps: generated.steps,
      substituted: false,
      scheduled: mode,
      budget: rawBudget,
      spent: generated.spent,
    };
  }

  // Classic: walk the authored ladder, substituting anything unregistered.
  const scheduledPool = classicPoolFor(level);
  const pool = scheduledPool.filter((id) => availableIds.includes(id));
  const substituted = pool.length !== scheduledPool.length;
  const effectivePool = pool.length > 0 ? pool : availableIds;
  const generated = generateLevel(effectivePool, rawBudget, pick);

  return {
    steps: generated.steps,
    substituted,
    scheduled: scheduledPool.length === 1 ? scheduledPool[0]! : null,
    budget: rawBudget,
    spent: generated.spent,
  };
}

export { CLASSIC_LEVELS };
