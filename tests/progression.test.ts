import { describe, expect, it } from 'vitest';
import { budgetForLevel } from '../src/content/curriculum';
import {
  BASE_PACE_MS,
  PACE_FLOOR_MS,
  gapMsForPace,
  paceForLevel,
} from '../src/core/progression';

describe('paceForLevel (CANON §4)', () => {
  it('rejects a non-positive or fractional level', () => {
    expect(() => paceForLevel(0)).toThrow(RangeError);
    expect(() => paceForLevel(-1)).toThrow(RangeError);
    expect(() => paceForLevel(1.5)).toThrow(RangeError);
  });

  it('starts at 800 ms', () => {
    expect(paceForLevel(1)).toBe(BASE_PACE_MS);
  });

  it.each([
    [2, 760],
    [5, 652],
    [10, 504],
    [14, 411],
  ])('level %i paces at %i ms', (level, expected) => {
    expect(paceForLevel(level)).toBe(expected);
  });

  it('clamps at the 400 ms floor, which first binds at level 15', () => {
    expect(paceForLevel(14)).toBe(411);
    expect(paceForLevel(15)).toBe(PACE_FLOOR_MS);
    expect(paceForLevel(200)).toBe(PACE_FLOOR_MS);
  });

  it('is monotonically non-increasing', () => {
    for (let level = 2; level <= 120; level += 1) {
      expect(paceForLevel(level)).toBeLessThanOrEqual(paceForLevel(level - 1));
    }
  });

  // decisions/0018: the defect was two knobs turning the same way. Past the
  // floor exactly one of them may still move, and it must be length.
  it('leaves length as the only difficulty knob once the floor binds', () => {
    for (let level = 15; level <= 29; level += 1) {
      expect(paceForLevel(level)).toBe(PACE_FLOOR_MS);
      expect(budgetForLevel(level + 1)).toBeGreaterThan(budgetForLevel(level));
    }
  });

  it('never drops below the threshold where a pad can be read and encoded', () => {
    for (let level = 1; level <= 500; level += 1) {
      expect(paceForLevel(level)).toBeGreaterThanOrEqual(400);
    }
  });
});

describe('gapMsForPace (decisions/0002)', () => {
  it('is a quarter of the pace once that clears the floor', () => {
    expect(gapMsForPace(800)).toBe(200);
    expect(gapMsForPace(652)).toBe(163);
  });

  it('never drops below 100 ms, so a repeated value still reads as two beats', () => {
    expect(gapMsForPace(250)).toBe(100);
    expect(gapMsForPace(100)).toBe(100);
  });
});
