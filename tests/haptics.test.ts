import { describe, expect, it, vi } from 'vitest';
import {
  MAX_PATTERN_MS,
  MAX_PULSE_MS,
  MIN_PULSE_MS,
  PATTERNS,
  clampPattern,
  createHaptics,
  type HapticIntent,
} from '../src/ui/haptics';

// CANON §8a / decisions/0021. Android is the target, so haptics are a real
// feature with real hardware constraints rather than a call that may or may
// not do something.

const INTENTS = Object.keys(PATTERNS) as HapticIntent[];

describe('clampPattern', () => {
  it('raises a sub-threshold pulse to the floor an Android motor can render', () => {
    // The defect this exists to prevent: the step pulse was 18 ms, which on an
    // ERM motor is indistinguishable from haptics being switched off.
    expect(clampPattern([18])).toEqual([MIN_PULSE_MS]);
    expect(clampPattern([1])).toEqual([MIN_PULSE_MS]);
  });

  it('leaves gaps alone — a short silence is perfectly renderable', () => {
    // Index 1 is a pause. Clamping it to 20 ms would smear the pattern.
    expect(clampPattern([40, 5, 40])).toEqual([40, 5, 40]);
  });

  it('caps a single pulse so no cue reads as a malfunction', () => {
    expect(clampPattern([5000])).toEqual([MAX_PULSE_MS]);
  });

  it('drops whole trailing beats rather than truncating one mid-pulse', () => {
    const long = Array.from({ length: 40 }, () => 100);
    const clamped = clampPattern(long);
    expect(clamped.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(MAX_PATTERN_MS);
    expect(clamped.length % 2).toBe(1);
  });

  it('never ends on a gap', () => {
    expect(clampPattern([30, 40])).toEqual([30]);
    expect(clampPattern([30, 40, 30, 40])).toEqual([30, 40, 30]);
  });

  it('handles an empty pattern without producing a stray pulse', () => {
    expect(clampPattern([])).toEqual([]);
  });
});

describe('every shipped pattern is renderable as written', () => {
  it.each(INTENTS)('%s survives clamping unchanged', (intent) => {
    // If a pattern needs clamping, the pattern is wrong — fix the table, do
    // not rely on the clamp to launder it.
    expect(clampPattern(PATTERNS[intent])).toEqual([...PATTERNS[intent]]);
  });

  it.each(INTENTS)('%s has no pulse below the perception floor', (intent) => {
    PATTERNS[intent].forEach((ms, i) => {
      if (i % 2 === 0) expect(ms, `pulse ${i}`).toBeGreaterThanOrEqual(MIN_PULSE_MS);
    });
  });

  it.each(INTENTS)('%s stays inside the total budget', (intent) => {
    const total = PATTERNS[intent].reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(MAX_PATTERN_MS);
  });

  it('keeps the per-step cue to a single pulse, so speed does not become a buzz', () => {
    expect(PATTERNS.step).toHaveLength(1);
    expect(PATTERNS.step[0]).toBeLessThanOrEqual(40);
  });

  it('distinguishes a personal best from an ordinary level clear', () => {
    expect(PATTERNS.bestRun).not.toEqual(PATTERNS.levelUp);
    const sum = (p: readonly number[]): number => p.reduce((a, b) => a + b, 0);
    expect(sum(PATTERNS.bestRun)).toBeGreaterThan(sum(PATTERNS.levelUp));
  });
});

describe('createHaptics', () => {
  it('dispatches the clamped pattern for the intent', () => {
    const vibrate = vi.fn(() => true);
    createHaptics({ vibrate, hasBeenActive: () => true }).play('levelUp');
    expect(vibrate).toHaveBeenCalledWith([40, 30, 60, 30, 90]);
  });

  it('is inert with no vibration API — no throw, no pretending', () => {
    const haptics = createHaptics({ vibrate: null });
    expect(haptics.available).toBe(false);
    expect(() => haptics.play('fail')).not.toThrow();
  });

  it('is muted by reduced motion', () => {
    const vibrate = vi.fn(() => true);
    const haptics = createHaptics({ vibrate, reducedMotion: true });
    haptics.play('fail');
    expect(haptics.available).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('is muted by the player-facing switch', () => {
    const vibrate = vi.fn(() => true);
    createHaptics({ vibrate, enabled: false }).play('fail');
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('stays silent until the document has sticky activation', () => {
    // Chrome ignores vibrate before activation and warns about it. Not calling
    // is quieter than being warned at, and behaves identically.
    const vibrate = vi.fn(() => true);
    let active = false;
    const haptics = createHaptics({ vibrate, hasBeenActive: () => active });

    haptics.play('tap');
    expect(vibrate).not.toHaveBeenCalled();

    active = true;
    haptics.play('tap');
    expect(vibrate).toHaveBeenCalledOnce();
  });

  it('cancels with an empty pattern once something is running', () => {
    const vibrate = vi.fn(() => true);
    const haptics = createHaptics({ vibrate, hasBeenActive: () => true });
    haptics.play('fail');
    haptics.cancel();
    expect(vibrate).toHaveBeenLastCalledWith([]);
  });

  it('does not touch the API when there is nothing to cancel', () => {
    // cancel() runs on every screen change, and most happen with nothing
    // playing. Calling vibrate anyway means the app touches the vibration API
    // before the player has touched anything.
    const vibrate = vi.fn(() => true);
    const haptics = createHaptics({ vibrate, hasBeenActive: () => true });
    haptics.cancel();
    haptics.cancel();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('does not re-cancel after a cancel', () => {
    const vibrate = vi.fn(() => true);
    const haptics = createHaptics({ vibrate, hasBeenActive: () => true });
    haptics.play('fail');
    haptics.cancel();
    haptics.cancel();
    expect(vibrate).toHaveBeenCalledTimes(2);
  });

  it('survives a vibrate implementation that throws', () => {
    const vibrate = vi.fn(() => {
      throw new Error('device busy');
    });
    const haptics = createHaptics({ vibrate, hasBeenActive: () => true });
    // A throwing motor must never take down a level transition.
    expect(() => haptics.play('levelUp')).not.toThrow();
    expect(() => haptics.cancel()).not.toThrow();
  });

  it('assumes activation when the browser has no userActivation probe', () => {
    const vibrate = vi.fn(() => true);
    // Muting haptics on a browser that merely lacks the probe would be worse
    // than occasionally issuing a call the UA ignores.
    createHaptics({ vibrate }).play('step');
    expect(vibrate).toHaveBeenCalledWith([25]);
  });
});
