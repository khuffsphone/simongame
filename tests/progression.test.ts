import { describe, expect, it } from 'vitest';
import {
  BASE_PACE_MS,
  PACE_FLOOR_MS,
  gapMsForPace,
  paceForLevel,
  stepsForLevel,
} from '../src/core/progression';

describe('stepsForLevel (CANON §4)', () => {
  it.each([
    [1, 3],
    [5, 7],
    [6, 10],
    [10, 15],
    [20, 28],
  ])('level %i has %i steps', (level, expected) => {
    expect(stepsForLevel(level)).toBe(expected);
  });

  it('jumps at the level 5/6 boundary where the formula switches', () => {
    expect(stepsForLevel(5)).toBe(7);
    expect(stepsForLevel(6)).toBe(10);
  });

  it('never decreases as the level climbs', () => {
    for (let level = 2; level <= 100; level += 1) {
      expect(stepsForLevel(level)).toBeGreaterThanOrEqual(stepsForLevel(level - 1));
    }
  });

  it('rejects a non-positive or fractional level', () => {
    expect(() => stepsForLevel(0)).toThrow(RangeError);
    expect(() => stepsForLevel(-1)).toThrow(RangeError);
    expect(() => stepsForLevel(1.5)).toThrow(RangeError);
  });
});

describe('paceForLevel (CANON §4)', () => {
  it('starts at 800 ms', () => {
    expect(paceForLevel(1)).toBe(BASE_PACE_MS);
  });

  it.each([
    [2, 760],
    [5, 652],
    [10, 504],
    [20, 302],
  ])('level %i paces at %i ms', (level, expected) => {
    expect(paceForLevel(level)).toBe(expected);
  });

  it('clamps at the 250 ms floor, which first binds at level 24', () => {
    expect(paceForLevel(23)).toBe(259);
    expect(paceForLevel(24)).toBe(PACE_FLOOR_MS);
    expect(paceForLevel(200)).toBe(PACE_FLOOR_MS);
  });

  it('is monotonically non-increasing', () => {
    for (let level = 2; level <= 120; level += 1) {
      expect(paceForLevel(level)).toBeLessThanOrEqual(paceForLevel(level - 1));
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
