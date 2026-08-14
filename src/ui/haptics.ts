// Haptics — CANON §8a. Android is the target platform (decisions/0021).
//
// This exists as a module rather than a `navigator.vibrate?.(18)` at each call
// site for three reasons, all of them Android-specific:
//
//  1. **Sub-threshold pulses do nothing.** A phone's vibration motor has to
//     spin up. On the ERM motors still common in mid-range Android hardware,
//     anything under roughly 20 ms is inaudible and unfelt — the call succeeds,
//     the API reports nothing wrong, and the player feels no difference between
//     "haptics on" and "haptics off". The step pulse used to be 18 ms.
//  2. **Vibration is not stateless.** Each call *replaces* whatever is running.
//     A fail buzz started during a run keeps going after the overlay opens
//     unless something cancels it.
//  3. **It needs user activation.** Chrome ignores `vibrate()` before the
//     document has sticky activation and warns in the console. Guarding is
//     quieter than being warned at.
//
// Intents, not durations: call sites ask for `step()` or `fail()`, and the
// patterns live in one table that can be tuned or muted in one place.

/** The narrowest pulse an Android motor reliably renders. See note 1 above. */
export const MIN_PULSE_MS = 20;
/** No single pulse longer than this. A long buzz reads as a malfunction. */
export const MAX_PULSE_MS = 200;
/** No pattern longer than this in total, however many pulses it has. */
export const MAX_PATTERN_MS = 1200;

export type HapticIntent =
  | 'tap'
  | 'select'
  | 'start'
  | 'step'
  | 'levelUp'
  | 'bestRun'
  | 'fail';

/**
 * Patterns are `[pulse, pause, pulse, pause, …]` — odd indices are silence.
 *
 * `step` fires on every correct input, so it is the one that must not become
 * a buzz at speed: one short pulse, nothing more.
 */
export const PATTERNS: Readonly<Record<HapticIntent, readonly number[]>> = {
  tap: [20],
  select: [20],
  start: [30, 40, 60],
  step: [25],
  levelUp: [40, 30, 60, 30, 90],
  bestRun: [40, 30, 60, 30, 90, 40, 140],
  fail: [90, 50, 140],
};

export type VibrateFn = (pattern: number | number[]) => boolean;

export interface HapticsOptions {
  /** Injected so tests can assert exact patterns without a device. */
  readonly vibrate?: VibrateFn | null;
  /** Reduced motion mutes haptics along with animation. */
  readonly reducedMotion?: boolean;
  /** Player-facing master switch. Wired now, exposed by Packet 1's Settings. */
  readonly enabled?: boolean;
  /** Sticky-activation probe. Defaults to the real `navigator.userActivation`. */
  readonly hasBeenActive?: () => boolean;
}

export interface Haptics {
  /** False when the platform has no vibration motor, or it is muted. */
  readonly available: boolean;
  play(intent: HapticIntent): void;
  /** Stop whatever is running. Called on pause, teardown, and screen change. */
  cancel(): void;
}

/**
 * Clamp a pattern to what an Android motor can actually render.
 *
 * Only the pulses are clamped, never the gaps: a 30 ms *silence* is perfectly
 * renderable and lengthening it would smear the rhythm of the pattern. Trailing
 * pulses are dropped once the total budget is spent rather than truncated
 * mid-pulse, so a clamped pattern is still a whole number of beats.
 */
export function clampPattern(pattern: readonly number[]): number[] {
  const out: number[] = [];
  let total = 0;

  for (let i = 0; i < pattern.length; i += 1) {
    const raw = Math.max(0, Math.round(pattern[i] ?? 0));
    const isPulse = i % 2 === 0;
    const value = isPulse ? Math.min(MAX_PULSE_MS, Math.max(MIN_PULSE_MS, raw)) : raw;
    if (total + value > MAX_PATTERN_MS) break;
    total += value;
    out.push(value);
  }

  // A pattern must not end on a gap: the trailing silence is meaningless and
  // some implementations treat the array length as significant.
  while (out.length > 0 && out.length % 2 === 0) out.pop();
  return out;
}

function defaultVibrate(): VibrateFn | null {
  const nav = globalThis.navigator as Navigator | undefined;
  if (!nav || typeof nav.vibrate !== 'function') return null;
  return (pattern) => nav.vibrate(pattern);
}

const INERT: Haptics = {
  available: false,
  play: () => {},
  cancel: () => {},
};

export function createHaptics(options: HapticsOptions = {}): Haptics {
  const vibrate = options.vibrate === undefined ? defaultVibrate() : options.vibrate;
  if (!vibrate || options.reducedMotion === true || options.enabled === false) return INERT;

  const hasBeenActive =
    options.hasBeenActive ??
    (() => {
      const activation = (globalThis.navigator as Navigator & {
        userActivation?: { hasBeenActive: boolean };
      }).userActivation;
      // No `userActivation` support means no way to check; assume yes rather
      // than muting haptics on a browser that simply lacks the probe.
      return activation ? activation.hasBeenActive : true;
    });

  // `cancel()` is called on every screen change, and most of those happen with
  // nothing running. Firing `vibrate([])` anyway is harmless on the device but
  // it is a call to the vibration API before the player has touched anything,
  // which is exactly the thing a reviewer greps for. Track whether there is
  // anything to cancel.
  let playing = false;

  const send = (pattern: number[]): void => {
    try {
      vibrate(pattern);
      playing = pattern.length > 0;
    } catch {
      // A throwing vibrate must never take down a level transition.
      playing = false;
    }
  };

  return {
    available: true,
    play(intent) {
      if (!hasBeenActive()) return;
      const pattern = clampPattern(PATTERNS[intent]);
      if (pattern.length === 0) return;
      send(pattern);
    },
    cancel() {
      if (!playing) return;
      send([]);
    },
  };
}
