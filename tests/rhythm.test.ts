import { describe, expect, it } from 'vitest';
import { RHYTHM_PATTERN_COUNT, patternFor, scoreRhythm } from '../src/modalities/rhythm';
import { createRng } from '../src/core/rng';
import { RhythmModality } from '../src/modalities';

describe('rhythm patterns', () => {
  it('generates every pattern index and nothing outside the set', () => {
    const rng = createRng(11);
    const seen = new Set<number>();
    for (let i = 0; i < 400; i += 1) {
      const value = RhythmModality.generateValue(rng, 1);
      expect(value.pattern).toBeGreaterThanOrEqual(0);
      expect(value.pattern).toBeLessThan(RHYTHM_PATTERN_COUNT);
      seen.add(value.pattern);
    }
    expect(seen.size).toBe(RHYTHM_PATTERN_COUNT);
  });

  it('includes a four-interval pattern, which is what the reference build broke', () => {
    const lengths = Array.from({ length: RHYTHM_PATTERN_COUNT }, (_, i) => patternFor(i).length);
    expect(lengths).toContain(4);
  });
});

describe('scoreRhythm', () => {
  it('scores an exact reproduction as a perfect pass', () => {
    for (let i = 0; i < RHYTHM_PATTERN_COUNT; i += 1) {
      const pattern = patternFor(i);
      const score = scoreRhythm([...pattern], pattern);
      expect(score.accuracy).toBeCloseTo(1, 10);
      expect(score.pass).toBe(true);
    }
  });

  it('is tempo-invariant: the same rhythm played faster still passes', () => {
    const pattern = patternFor(1);
    for (const rate of [0.6, 0.8, 1.25, 1.7]) {
      const played = pattern.map((ms) => ms * rate);
      const score = scoreRhythm(played, pattern);
      expect(score.accuracy).toBeCloseTo(1, 8);
      expect(score.pass).toBe(true);
    }
  });

  it('fails a rhythm with the right total but the wrong shape', () => {
    // [220, 220, 560] played as an even triplet: same total, wrong rhythm.
    const pattern = patternFor(1);
    const total = pattern.reduce((a, b) => a + b, 0);
    const even = pattern.map(() => total / pattern.length);
    const score = scoreRhythm(even, pattern);
    expect(score.pass).toBe(false);
    expect(score.accuracy).toBeLessThan(0.75);
  });

  it('fails a dropped beat outright, however good the surviving shape is', () => {
    const pattern = patternFor(4); // four intervals
    const truncated = pattern.slice(0, 3);
    const score = scoreRhythm(truncated, pattern);
    // The three surviving intervals are perfect, so the shape term is 1 and the
    // count penalty alone lands accuracy exactly on the 0.75 threshold. Without
    // the hard length gate this would pass.
    expect(score.accuracy).toBeCloseTo(0.75, 6);
    expect(score.pass).toBe(false);
  });

  it('fails an extra beat too', () => {
    const pattern = patternFor(0);
    const score = scoreRhythm([...pattern, 400], pattern);
    expect(score.pass).toBe(false);
  });

  it('pass requires the right interval count as well as the accuracy', () => {
    const pattern = patternFor(0);
    expect(scoreRhythm([...pattern], pattern).pass).toBe(true);
    expect(scoreRhythm(pattern.slice(0, 2), pattern).pass).toBe(false);
  });

  it('scores an empty or zero-length capture as zero', () => {
    expect(scoreRhythm([], patternFor(0))).toEqual({ pass: false, accuracy: 0 });
    expect(scoreRhythm([0, 0, 0], patternFor(0))).toEqual({ pass: false, accuracy: 0 });
  });

  it('tolerates small human jitter', () => {
    const pattern = patternFor(0);
    const jittered = pattern.map((ms, i) => ms + (i % 2 === 0 ? 18 : -14));
    const score = scoreRhythm(jittered, pattern);
    expect(score.pass).toBe(true);
  });

  it('pass is accuracy >= 0.75 once the interval count matches', () => {
    const pattern = patternFor(2);
    for (const skew of [0, 40, 80, 120, 200, 320]) {
      const played = pattern.map((ms, i) => ms + (i === 0 ? skew : 0));
      const score = scoreRhythm(played, pattern);
      expect(score.pass).toBe(score.accuracy >= 0.75);
    }
  });
});
