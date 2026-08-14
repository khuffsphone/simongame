import { describe, expect, it } from 'vitest';
import {
  COMFORTABLE_ABOVE,
  INERT_ADAPTIVE,
  MAX_ASSIST,
  MAX_PRESSURE,
  MIN_ATTEMPTS,
  STRUGGLING_BELOW,
  adaptivityAllowed,
  createAdaptiveProfile,
  scaleForRecord,
} from '../src/core/adaptive';
import { ACCURACY_WINDOW, Persistence, type ModalityRecord } from '../src/core/persistence';

function record(attempts: number, passes: number): ModalityRecord {
  return { attempts, passes, accuracyTotal: passes };
}

describe('scaleForRecord (CANON §4b)', () => {
  it('does nothing until the record has enough attempts to mean anything', () => {
    // 0% pass rate, but only 7 attempts: two bad levels are not a diagnosis.
    expect(scaleForRecord(record(MIN_ATTEMPTS - 1, 0))).toBe(1);
    expect(scaleForRecord(record(MIN_ATTEMPTS, 0))).toBeGreaterThan(1);
  });

  it('does nothing for a modality that has never been played', () => {
    expect(scaleForRecord(undefined)).toBe(1);
  });

  it('gives the most time at a 0% pass rate and none at the knee', () => {
    expect(scaleForRecord(record(20, 0))).toBeCloseTo(MAX_ASSIST, 10);
    expect(scaleForRecord(record(20, 20 * STRUGGLING_BELOW))).toBeCloseTo(1, 10);
  });

  it('leaves the whole competent band alone', () => {
    for (const rate of [0.6, 0.7, 0.8, 0.9]) {
      expect(scaleForRecord(record(100, 100 * rate))).toBe(1);
    }
  });

  it('tightens only above the comfortable knee, bottoming out at a perfect record', () => {
    expect(scaleForRecord(record(100, 100 * COMFORTABLE_ABOVE))).toBe(1);
    expect(scaleForRecord(record(100, 95))).toBeCloseTo(0.95, 10);
    expect(scaleForRecord(record(100, 100))).toBeCloseTo(MAX_PRESSURE, 10);
  });

  it('is monotonic: more passes never buys more time', () => {
    let previous = Infinity;
    for (let passes = 0; passes <= 100; passes += 1) {
      const scale = scaleForRecord(record(100, passes));
      expect(scale).toBeLessThanOrEqual(previous);
      previous = scale;
    }
  });

  it('stays inside its declared bounds for every reachable rate', () => {
    for (let passes = 0; passes <= 100; passes += 1) {
      const scale = scaleForRecord(record(100, passes));
      expect(scale).toBeGreaterThanOrEqual(MAX_PRESSURE);
      expect(scale).toBeLessThanOrEqual(MAX_ASSIST);
    }
  });
});

describe('createAdaptiveProfile', () => {
  it('is inert when no record moves anything', () => {
    expect(createAdaptiveProfile({ color: record(100, 75) })).toBe(INERT_ADAPTIVE);
    expect(createAdaptiveProfile({})).toBe(INERT_ADAPTIVE);
  });

  it('is inert when explicitly disabled, however bad the record', () => {
    const profile = createAdaptiveProfile({ trace: record(50, 0) }, { enabled: false });
    expect(profile).toBe(INERT_ADAPTIVE);
    expect(profile.presentScaleFor('trace')).toBe(1);
    expect(profile.active).toBe(false);
  });

  it('scales only the modality the record is about', () => {
    const profile = createAdaptiveProfile({ trace: record(50, 5), color: record(50, 40) });
    expect(profile.presentScaleFor('trace')).toBeGreaterThan(1);
    expect(profile.presentScaleFor('color')).toBe(1);
    expect(profile.presentScaleFor('rhythm')).toBe(1);
  });

  it('lists every assisted modality and nothing else', () => {
    const profile = createAdaptiveProfile({
      trace: record(50, 5), // struggling  -> assisted
      rhythm: record(50, 10), // struggling  -> assisted
      color: record(50, 50), // perfect     -> tightened, not assisted
      shape: record(50, 35), // competent   -> untouched
    });
    expect([...profile.assisted].sort()).toEqual(['rhythm', 'trace']);
    expect(profile.active).toBe(true);
  });

  it('never shortens the answer clock, even for a perfect record', () => {
    const profile = createAdaptiveProfile({ color: record(50, 50) });
    expect(profile.presentScaleFor('color')).toBeLessThan(1);
    expect(profile.timeoutScaleFor('color')).toBe(1);
  });

  it('lengthens the answer clock in step with the demonstration', () => {
    const profile = createAdaptiveProfile({ trace: record(50, 0) });
    expect(profile.timeoutScaleFor('trace')).toBe(profile.presentScaleFor('trace'));
  });
});

describe('fixed rulesets', () => {
  it('refuses adaptivity for the daily challenge', () => {
    // Forward declaration: `daily` is not a mode yet. The gate exists now so it
    // cannot ship without one.
    expect(adaptivityAllowed('daily')).toBe(false);
  });

  it('allows it for every mode that exists today', () => {
    for (const mode of ['classic', 'quickmix', 'marathon', 'trace', 'rhythm']) {
      expect(adaptivityAllowed(mode)).toBe(true);
    }
  });
});

describe('the accuracy record forgets (recency window)', () => {
  function memoryStorage(): Storage {
    const map = new Map<string, string>();
    return {
      get length() {
        return map.size;
      },
      clear: () => map.clear(),
      getItem: (k: string) => map.get(k) ?? null,
      key: (i: number) => [...map.keys()][i] ?? null,
      removeItem: (k: string) => map.delete(k),
      setItem: (k: string, v: string) => void map.set(k, v),
    } as Storage;
  }

  it('caps the effective sample size, so a record cannot become unmovable', () => {
    const p = new Persistence(memoryStorage());
    for (let i = 0; i < 500; i += 1) p.recordScore('trace', false, 0);
    const after = p.snapshot().modalityAccuracy['trace']!;
    expect(after.attempts).toBeLessThanOrEqual(ACCURACY_WINDOW + 1);
    expect(after.attempts).toBeGreaterThan(ACCURACY_WINDOW - 1);
  });

  /**
   * The point of the window, stated as the thing a player would notice: after a
   * long bad streak, a run of good play must actually turn the assist off.
   * With lifetime totals it never would.
   */
  it('lets a player earn their way out of an assist', () => {
    const p = new Persistence(memoryStorage());
    for (let i = 0; i < 200; i += 1) p.recordScore('trace', false, 0);
    expect(scaleForRecord(p.snapshot().modalityAccuracy['trace'])).toBeCloseTo(MAX_ASSIST, 10);

    for (let i = 0; i < 60; i += 1) p.recordScore('trace', true, 1);
    expect(scaleForRecord(p.snapshot().modalityAccuracy['trace'])).toBeLessThan(1.02);
  });

  it('leaves a short record undecayed, so early attempts are counted exactly', () => {
    const p = new Persistence(memoryStorage());
    for (let i = 0; i < 10; i += 1) p.recordScore('color', i % 2 === 0, i % 2);
    const after = p.snapshot().modalityAccuracy['color']!;
    expect(after.attempts).toBe(10);
    expect(after.passes).toBe(5);
  });
});
