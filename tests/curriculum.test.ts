import { describe, expect, it } from 'vitest';
import {
  CLASSIC_LADDER,
  CLASSIC_LEVELS,
  COGNITIVE_COST,
  MAX_STEPS,
  MIN_STEPS,
  budgetForLevel,
  classicPoolFor,
  costOf,
  generateLevel,
} from '../src/content/curriculum';
import { BUDGET_MULTIPLIER, buildModePlan, marathonStepsPerModality } from '../src/core/modes';
import { createRng } from '../src/core/rng';

const ALL = ['color', 'number', 'shape', 'sound', 'trace', 'rhythm'];
const pickFrom = (rng: ReturnType<typeof createRng>) => (bound: number) => rng.nextInt(bound);

describe('the teaching ladder (CANON §4)', () => {
  it('teaches every modality before the all-modality level', () => {
    const taught = new Set<string>();
    for (let level = 1; level < CLASSIC_LEVELS; level += 1) {
      const pool = classicPoolFor(level);
      if (pool.length === 1) taught.add(pool[0]!);
    }
    expect([...taught].sort()).toEqual([...ALL].sort());
  });

  it('never introduces a modality inside an integration level', () => {
    // The old schedule's actual defect: rhythm first appeared at level 6,
    // interleaved with five others, having never been taught alone.
    const taught = new Set<string>();
    for (let level = 1; level <= CLASSIC_LEVELS; level += 1) {
      const pool = classicPoolFor(level);
      if (pool.length === 1) {
        taught.add(pool[0]!);
        continue;
      }
      for (const id of pool) {
        expect(taught.has(id), `level ${level} uses untaught "${id}"`).toBe(true);
      }
    }
  });

  it('alternates teaching and integration rather than stacking a wall', () => {
    expect(classicPoolFor(1)).toEqual(['color']);
    expect(classicPoolFor(2)).toEqual(['number']);
    expect(classicPoolFor(3)).toEqual(['color', 'number']);
    expect(classicPoolFor(10)).toHaveLength(6);
  });

  it('keeps drawing from everything past the authored ladder', () => {
    expect(classicPoolFor(CLASSIC_LEVELS + 5)).toEqual(CLASSIC_LADDER[CLASSIC_LEVELS - 1]);
  });
});

describe('cognitive cost', () => {
  it('prices expensive modalities above cheap ones', () => {
    expect(costOf('trace')).toBeGreaterThan(costOf('rhythm'));
    expect(costOf('rhythm')).toBeGreaterThan(costOf('sound'));
    expect(costOf('sound')).toBeGreaterThan(costOf('shape'));
    expect(costOf('shape')).toBeGreaterThan(costOf('color'));
    expect(costOf('color')).toBe(costOf('number'));
  });

  it('falls back to 1.0 for an unpriced modality', () => {
    expect(costOf('brand-new-thing')).toBe(1);
    expect(COGNITIVE_COST['color']).toBe(1);
  });
});

describe('budgeted generation', () => {
  it('preserves the historical step count for a cheap modality', () => {
    // Colour costs 1.0, so a colour level generates exactly what it used to.
    for (const level of [1, 2, 3, 5]) {
      const generated = generateLevel(['color'], budgetForLevel(level), pickFrom(createRng(1)));
      expect(generated.steps).toHaveLength(budgetForLevel(level));
    }
  });

  it('stops a trace level demanding one drawing per allowed tap', () => {
    // Level 8 budget is 13. Thirteen taps was the old behaviour; at cost 2.5
    // a trace level is five drawings.
    const budget = budgetForLevel(8);
    expect(budget).toBe(13);
    const generated = generateLevel(['trace'], budget, pickFrom(createRng(2)));
    expect(generated.steps).toHaveLength(5);
    expect(generated.steps.every((id) => id === 'trace')).toBe(true);
  });

  it('keeps a rhythm level challenging without becoming tedious', () => {
    const generated = generateLevel(['rhythm'], budgetForLevel(9), pickFrom(createRng(3)));
    expect(generated.steps.length).toBeGreaterThanOrEqual(5);
    expect(generated.steps.length).toBeLessThanOrEqual(8);
  });

  it('never exceeds its budget', () => {
    for (let level = 1; level <= 30; level += 1) {
      const budget = budgetForLevel(level);
      const generated = generateLevel(ALL, budget, pickFrom(createRng(level)));
      // The floor may overshoot on a pathologically expensive pool; otherwise
      // spending must stay inside the budget.
      if (generated.steps.length > MIN_STEPS) {
        expect(generated.spent).toBeLessThanOrEqual(budget + 1e-9);
      }
    }
  });

  it('always produces a playable level, even on an all-expensive pool', () => {
    const generated = generateLevel(['trace'], 1, pickFrom(createRng(9)));
    expect(generated.steps.length).toBeGreaterThanOrEqual(MIN_STEPS);
  });

  it('bounds level length so a cheap pool cannot run forever', () => {
    const generated = generateLevel(['color'], 5000, pickFrom(createRng(4)));
    expect(generated.steps).toHaveLength(MAX_STEPS);
  });

  it('is deterministic for a fixed seed', () => {
    const a = generateLevel(ALL, 20, pickFrom(createRng(77))).steps;
    const b = generateLevel(ALL, 20, pickFrom(createRng(77))).steps;
    expect(a).toEqual(b);
  });

  it('rejects an empty pool', () => {
    expect(() => generateLevel([], 10, pickFrom(createRng(1)))).toThrow(/empty pool/i);
  });
});

describe('mode plans', () => {
  it('classic level 1 is still three colour steps', () => {
    const plan = buildModePlan('classic', 1, createRng(5), ALL);
    expect(plan.steps).toEqual(['color', 'color', 'color']);
  });

  it('classic level 3 integrates rather than teaching something new', () => {
    const plan = buildModePlan('classic', 3, createRng(5), ALL);
    expect(new Set(plan.steps).size).toBeGreaterThan(1);
    for (const id of plan.steps) expect(['color', 'number']).toContain(id);
  });

  it('classic has no cliff: level 6 is a single taught modality, not all six', () => {
    const plan = buildModePlan('classic', 6, createRng(5), ALL);
    expect(new Set(plan.steps)).toEqual(new Set(['sound']));
  });

  it('substitutes an unregistered modality and says so', () => {
    const available = ['color', 'number'];
    const plan = buildModePlan('classic', 8, createRng(6), available); // ladder says trace
    expect(plan.substituted).toBe(true);
    for (const id of plan.steps) expect(available).toContain(id);
  });

  it('quick mix caps its budget so a run stays short', () => {
    const long = buildModePlan('quickmix', 30, createRng(7), ALL);
    const short = buildModePlan('quickmix', 2, createRng(7), ALL);
    expect(long.budget).toBeLessThanOrEqual(12);
    expect(long.steps.length).toBeLessThanOrEqual(12);
    expect(short.steps.length).toBeGreaterThan(0);
  });

  it('marathon keeps the every-modality-every-phase behaviour under its own name', () => {
    const plan = buildModePlan('marathon', 1, createRng(8), ALL);
    expect(plan.steps).toHaveLength(marathonStepsPerModality(1) * ALL.length);
    expect([...new Set(plan.steps)]).toEqual(ALL);
  });

  it('a single-modality mode is budgeted, not step-counted', () => {
    const trace = buildModePlan('trace', 8, createRng(9), ALL);
    expect(trace.steps.every((id) => id === 'trace')).toBe(true);
    expect(trace.steps.length).toBeLessThan(budgetForLevel(8));
  });

  it('difficulty changes length, never the perception floor', () => {
    const easy = buildModePlan('classic', 7, createRng(11), ALL, 'easy');
    const hard = buildModePlan('classic', 7, createRng(11), ALL, 'hard');
    expect(BUDGET_MULTIPLIER.hard).toBeGreaterThan(BUDGET_MULTIPLIER.easy);
    expect(hard.budget).toBeGreaterThan(easy.budget);
  });

  it('rejects a mode that is not a registered modality', () => {
    expect(() => buildModePlan('smell', 1, createRng(1), ALL)).toThrow(/not a registered/i);
  });

  it('refuses to plan with no registered modalities', () => {
    expect(() => buildModePlan('classic', 1, createRng(1), [])).toThrow(/no registered/i);
  });
});
