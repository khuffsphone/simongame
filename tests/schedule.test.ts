import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';
import { INTERLEAVE_FROM_LEVEL, LEVEL_SCHEDULE, resolveLevelPlan } from '../src/core/schedule';

const ALL = ['color', 'number', 'shape', 'sound', 'trace'];

describe('level schedule (CANON §4)', () => {
  it('names colour, number, shape, sound, trace for levels 1-5', () => {
    expect(LEVEL_SCHEDULE).toEqual(ALL);
    expect(INTERLEAVE_FROM_LEVEL).toBe(6);
  });

  it.each([
    [1, 'color'],
    [2, 'number'],
    [3, 'shape'],
    [4, 'sound'],
    [5, 'trace'],
  ])('level %i is entirely %s when it is registered', (level, id) => {
    const plan = resolveLevelPlan(level, 4, createRng(1), ALL);
    expect(plan.steps).toEqual([id, id, id, id]);
    expect(plan.scheduled).toBe(id);
    expect(plan.substituted).toBe(false);
  });

  it('interleaves from level 6, drawing per step', () => {
    const plan = resolveLevelPlan(6, 40, createRng(3), ALL);
    expect(plan.scheduled).toBeNull();
    expect(plan.substituted).toBe(false);
    expect(plan.steps).toHaveLength(40);
    expect(new Set(plan.steps).size).toBeGreaterThan(1);
    for (const id of plan.steps) expect(ALL).toContain(id);
  });

  it('substitutes an unregistered modality from the registered pool (decisions/0004)', () => {
    const available = ['color', 'number'];
    const plan = resolveLevelPlan(3, 5, createRng(9), available);
    expect(plan.scheduled).toBe('shape');
    expect(plan.substituted).toBe(true);
    expect(plan.steps).toHaveLength(5);
    for (const id of plan.steps) expect(available).toContain(id);
  });

  it('keeps substitution deterministic, so a seeded repro survives it', () => {
    const a = resolveLevelPlan(4, 8, createRng(77), ['color', 'number']);
    const b = resolveLevelPlan(4, 8, createRng(77), ['color', 'number']);
    expect(a.steps).toEqual(b.steps);
  });

  it('does not report substitution on an interleaved level', () => {
    const plan = resolveLevelPlan(9, 6, createRng(5), ['color']);
    expect(plan.substituted).toBe(false);
    expect(plan.steps).toEqual(Array(6).fill('color'));
  });

  it('rejects impossible inputs', () => {
    expect(() => resolveLevelPlan(0, 3, createRng(1), ALL)).toThrow(RangeError);
    expect(() => resolveLevelPlan(1, 0, createRng(1), ALL)).toThrow(RangeError);
    expect(() => resolveLevelPlan(1, 3, createRng(1), [])).toThrow(/no registered modalities/i);
  });
});
