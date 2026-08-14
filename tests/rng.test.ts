import { describe, expect, it } from 'vitest';
import { createRng, hashSeed, normalizeSeed, randomSeed } from '../src/core/rng';

const draw = (seed: number, count = 12): number[] => {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => rng.next());
};

describe('seeded LCG (CANON §5)', () => {
  it('is deterministic: the same seed replays the same stream', () => {
    expect(draw(20260814)).toEqual(draw(20260814));
    expect(draw(0)).toEqual(draw(0));
  });

  it('produces a stable stream across runs, so ?seed= repros survive', () => {
    // Locked-in values. If the generator changes, every recorded repro breaks —
    // that is a canon change, not an implementation detail.
    const rng = createRng(1);
    const first = Array.from({ length: 5 }, () => rng.nextInt(4));
    expect(first).toEqual([0, 1, 3, 2, 0]);
  });

  it('diverges for different seeds', () => {
    expect(draw(1)).not.toEqual(draw(2));
    expect(draw(0)).not.toEqual(draw(1));
  });

  it('decorrelates adjacent seeds on the very first draw (the warm-up)', () => {
    // Without warm-up an LCG's first output is near-linear in the seed, so
    // ?seed=1 and ?seed=2 would open identically at low cardinality.
    const openings = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => createRng(s).nextInt(4)));
    expect(openings.size).toBeGreaterThan(1);
  });

  it('keeps next() in [0, 1)', () => {
    const rng = createRng(99);
    for (let i = 0; i < 2000; i += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('keeps nextInt(n) in [0, n) and covers every option', () => {
    const rng = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 4000; i += 1) {
      const value = rng.nextInt(4);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(4);
      seen.add(value);
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);
  });

  it('rejects a non-positive cardinality', () => {
    const rng = createRng(1);
    expect(() => rng.nextInt(0)).toThrow(RangeError);
    expect(() => rng.nextInt(-3)).toThrow(RangeError);
    expect(() => rng.nextInt(2.5)).toThrow(RangeError);
  });

  it('survives a 32-bit seed without precision loss', () => {
    expect(createRng(0xffffffff).seed).toBe(0xffffffff);
    expect(draw(0xffffffff)).toEqual(draw(0xffffffff));
  });
});

describe('seed normalization', () => {
  it('treats a bare integer as the seed itself', () => {
    expect(normalizeSeed('7')).toBe(7);
    expect(normalizeSeed('0')).toBe(0);
  });

  it('hashes a non-numeric seed', () => {
    expect(normalizeSeed('repro-42')).toBe(hashSeed('repro-42'));
    expect(normalizeSeed('repro-42')).toBe(normalizeSeed('repro-42'));
    expect(normalizeSeed('a')).not.toBe(normalizeSeed('b'));
  });

  it('returns null for absent or empty input', () => {
    expect(normalizeSeed(null)).toBeNull();
    expect(normalizeSeed(undefined)).toBeNull();
    expect(normalizeSeed('   ')).toBeNull();
  });

  it('produces a uint32 from a random seed', () => {
    for (let i = 0; i < 50; i += 1) {
      const seed = randomSeed();
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0xffffffff);
    }
  });
});
