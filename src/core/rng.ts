// Seeded LCG — CANON §5, decisions/0001.

const MULTIPLIER = 1664525;
const INCREMENT = 1013904223;
const TWO_32 = 0x1_0000_0000;

/** Advancing this many times after seeding decorrelates adjacent seeds. */
const WARMUP_STEPS = 4;

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [0, n). Throws for n < 1. */
  nextInt(n: number): number;
  /** The seed this generator was created with. */
  readonly seed: number;
}

/** FNV-1a, so a string seed like `?seed=repro-42` is usable. */
export function hashSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Accepts what a query string can hand us and produces a uint32 seed. */
export function normalizeSeed(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw >>> 0 : null;
  }
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  // A bare integer seeds directly so `?seed=7` means seed 7, not hash("7").
  if (/^[0-9]+$/.test(trimmed)) {
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isSafeInteger(parsed) ? parsed >>> 0 : hashSeed(trimmed);
  }
  return hashSeed(trimmed);
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const advance = (): number => {
    state = (Math.imul(MULTIPLIER, state) + INCREMENT) >>> 0;
    return state;
  };
  for (let i = 0; i < WARMUP_STEPS; i += 1) advance();

  return {
    seed: seed >>> 0,
    next: () => advance() / TWO_32,
    nextInt: (n: number) => {
      if (!Number.isInteger(n) || n < 1) {
        throw new RangeError(`nextInt requires a positive integer, received ${n}`);
      }
      // Reads the high bits via the float conversion; an LCG's low bits are weak.
      return Math.floor((advance() / TWO_32) * n);
    },
  };
}

/** A fresh seed for an unpinned run. */
export function randomSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}
