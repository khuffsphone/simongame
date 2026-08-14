import { describe, expect, it } from 'vitest';
import {
  PRESENT_MULTIPLIER,
  TIMEOUT_MULTIPLIER,
  buildModePlan,
  mixedStepsPerModality,
} from '../src/core/modes';
import { stepsForLevel } from '../src/core/progression';
import { createRng } from '../src/core/rng';

const ALL = ['color', 'number', 'shape', 'sound', 'trace', 'rhythm'];

describe('mixed mode', () => {
  it('gives 3 steps per type in phase 1, then 4, then 5', () => {
    expect(mixedStepsPerModality(1)).toBe(3);
    expect(mixedStepsPerModality(2)).toBe(4);
    expect(mixedStepsPerModality(3)).toBe(5);
    expect(mixedStepsPerModality(9)).toBe(11);
  });

  it('runs every registered modality, in registration order', () => {
    const plan = buildModePlan('mixed', 1, createRng(1), ALL);
    expect(plan.steps).toHaveLength(3 * ALL.length);
    // Grouped by modality, in order.
    expect(plan.steps.slice(0, 3)).toEqual(['color', 'color', 'color']);
    expect(plan.steps.slice(3, 6)).toEqual(['number', 'number', 'number']);
    expect([...new Set(plan.steps)]).toEqual(ALL);
  });

  it('grows by exactly one step per modality per phase', () => {
    const before = buildModePlan('mixed', 2, createRng(1), ALL).steps.length;
    const after = buildModePlan('mixed', 3, createRng(1), ALL).steps.length;
    expect(after - before).toBe(ALL.length);
  });
});

describe('classic mode', () => {
  it.each([
    [1, 'color'],
    [2, 'number'],
    [3, 'shape'],
    [4, 'sound'],
    [5, 'trace'],
  ])('level %i is entirely %s', (level, id) => {
    const plan = buildModePlan('classic', level, createRng(2), ALL);
    expect(plan.steps).toEqual(Array(stepsForLevel(level)).fill(id));
    expect(plan.substituted).toBe(false);
  });

  it('interleaves from level 6 at the classic step count', () => {
    const plan = buildModePlan('classic', 8, createRng(4), ALL);
    expect(plan.steps).toHaveLength(stepsForLevel(8));
    expect(new Set(plan.steps).size).toBeGreaterThan(1);
    for (const id of plan.steps) expect(ALL).toContain(id);
  });

  it('substitutes a scheduled modality that is not registered', () => {
    const available = ['color', 'number'];
    const plan = buildModePlan('classic', 5, createRng(7), available);
    expect(plan.scheduled).toBe('trace');
    expect(plan.substituted).toBe(true);
    for (const id of plan.steps) expect(available).toContain(id);
  });
});

describe('single-modality modes', () => {
  it.each(ALL)('plays only %s', (id) => {
    const plan = buildModePlan(id, 4, createRng(3), ALL);
    expect(plan.steps).toEqual(Array(stepsForLevel(4)).fill(id));
    expect(plan.scheduled).toBe(id);
  });

  it('rejects a mode that is not a registered modality', () => {
    expect(() => buildModePlan('smell', 1, createRng(1), ALL)).toThrow(/not a registered/i);
  });
});

describe('determinism and guards', () => {
  it('is reproducible for a fixed seed', () => {
    const a = buildModePlan('classic', 9, createRng(99), ALL).steps;
    const b = buildModePlan('classic', 9, createRng(99), ALL).steps;
    expect(a).toEqual(b);
  });

  it('refuses to plan with no registered modalities', () => {
    expect(() => buildModePlan('classic', 1, createRng(1), [])).toThrow(/no registered/i);
  });
});

describe('difficulty multipliers', () => {
  it('slows presentation and lengthens the capture budget on easy', () => {
    expect(PRESENT_MULTIPLIER.easy).toBeGreaterThan(1);
    expect(TIMEOUT_MULTIPLIER.easy).toBeGreaterThan(1);
  });

  it('speeds presentation and shortens the capture budget on hard', () => {
    expect(PRESENT_MULTIPLIER.hard).toBeLessThan(1);
    expect(TIMEOUT_MULTIPLIER.hard).toBeLessThan(1);
  });

  it('leaves normal untouched', () => {
    expect(PRESENT_MULTIPLIER.normal).toBe(1);
    expect(TIMEOUT_MULTIPLIER.normal).toBe(1);
  });
});
