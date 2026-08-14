import { abortError, throwIfAborted, wait } from '../core/clock';
import type { Rng } from '../core/rng';
import type { CaptureResult, Modality, ModalityServices, StepScore } from '../core/types';
import './rhythm.css';

// Rhythm — reproduce an inter-tap interval pattern.
//
// The value is a pattern index; the capture is the list of intervals the player
// tapped. Capture ends on silence rather than on a tap count, because the
// contract gives `captureStep` no knowledge of what was expected — and a
// fixed-count terminator is exactly the bug in the reference builds, where a
// four-interval pattern resolved after three.

const PATTERNS: readonly (readonly number[])[] = [
  [420, 420, 420],
  [220, 220, 560],
  [560, 220, 220],
  [300, 600, 300],
  [200, 200, 200, 600],
];

const BEAT_FLASH_MS = 120;
/** Silence after the last tap that ends the capture. */
const SILENCE_MS = 900;
const MAX_TAPS = 16;
const PASS_THRESHOLD = 0.75;
/** Mean proportional deviation that scores zero. */
const SHAPE_TOLERANCE = 0.18;

export function patternFor(index: number): readonly number[] {
  return PATTERNS[index] ?? PATTERNS[0]!;
}

export const RHYTHM_PATTERN_COUNT = PATTERNS.length;

/**
 * Tempo-invariant scoring: both interval lists are converted to proportions of
 * their own total, so playing the right rhythm slightly fast still passes.
 *
 * Interval count is a hard gate, not a weighted penalty. Dropping a beat from a
 * four-beat pattern still leaves three perfect intervals, which scored exactly
 * at the threshold and passed — reproducing a rhythm means reproducing all of
 * it, so a count mismatch fails regardless of how good the shape was.
 */
export function scoreRhythm(captured: readonly number[], expected: readonly number[]): StepScore {
  if (expected.length === 0) return { pass: false, accuracy: 0 };
  if (captured.length === 0) return { pass: false, accuracy: 0 };

  const k = Math.min(captured.length, expected.length);
  const headC = captured.slice(0, k);
  const headE = expected.slice(0, k);
  const sumC = headC.reduce((a, b) => a + b, 0);
  const sumE = headE.reduce((a, b) => a + b, 0);
  if (sumC <= 0 || sumE <= 0) return { pass: false, accuracy: 0 };

  let error = 0;
  for (let i = 0; i < k; i += 1) error += Math.abs(headC[i]! / sumC - headE[i]! / sumE);
  const meanError = error / k;

  const shape = Math.min(1, Math.max(0, 1 - meanError / SHAPE_TOLERANCE));
  const countPenalty = Math.min(1, Math.abs(captured.length - expected.length) / expected.length);
  const accuracy = shape * (1 - countPenalty);
  const rightLength = captured.length === expected.length;

  return { pass: rightLength && accuracy >= PASS_THRESHOLD, accuracy };
}

export class RhythmModality implements Modality<number, number[]> {
  static readonly id = 'rhythm';
  static readonly label = 'Rhythm';
  static readonly blurb = 'Tap back the beat.';
  static readonly minPresentMs = 260;
  static readonly captureTimeoutMs = 10000;

  static generateValue(rng: Rng, _level: number): number {
    return rng.nextInt(PATTERNS.length);
  }

  #services: ModalityServices | null = null;
  #root: HTMLElement | null = null;
  #pad: HTMLButtonElement | null = null;

  mount(container: HTMLElement, services: ModalityServices): void {
    this.#services = services;

    const root = document.createElement('div');
    root.className = 'rhythm';
    root.dataset['active'] = 'false';
    root.dataset['armed'] = 'false';

    const pad = document.createElement('button');
    pad.type = 'button';
    pad.className = 'rhythm__pad';
    pad.dataset['presenting'] = 'false';
    pad.setAttribute('aria-label', 'rhythm pad');

    const ring = document.createElement('span');
    ring.className = 'rhythm__ring';
    const label = document.createElement('span');
    label.className = 'rhythm__label';
    label.textContent = 'TAP';
    pad.append(ring, label);

    root.append(pad);
    container.append(root);
    this.#root = root;
    this.#pad = pad;
  }

  unmount(): void {
    this.#root?.remove();
    this.#root = null;
    this.#pad = null;
    this.#services = null;
  }

  activate(signal: AbortSignal): void {
    if (!this.#root) return;
    this.#root.dataset['active'] = 'true';
    signal.addEventListener('abort', () => this.deactivate(), { once: true });
  }

  deactivate(): void {
    if (!this.#root) return;
    this.#root.dataset['active'] = 'false';
    this.#root.dataset['armed'] = 'false';
    delete this.#root.dataset['stepValue'];
    if (this.#pad) this.#pad.dataset['presenting'] = 'false';
  }

  /**
   * Presentation length is defined by the pattern, not by the engine's pace —
   * the intervals *are* the content. `durationMs` sets the flash length only.
   */
  async presentStep(value: number, durationMs: number, signal: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    const root = this.#root;
    const pad = this.#pad;
    if (!root || !pad || !this.#services) throw new Error('rhythm not mounted');

    const pattern = patternFor(value);
    const flash = Math.min(BEAT_FLASH_MS, Math.max(60, durationMs * 0.4));
    root.dataset['stepValue'] = String(value);

    try {
      // n intervals means n+1 beats.
      for (let beat = 0; beat <= pattern.length; beat += 1) {
        pad.dataset['presenting'] = 'true';
        this.#services.audio.tone({ freq: 440, durationMs: flash, type: 'square', gain: 0.3 });
        await wait(this.#services.clock, flash, signal);
        pad.dataset['presenting'] = 'false';
        const gap = pattern[beat];
        if (gap !== undefined) await wait(this.#services.clock, Math.max(0, gap - flash), signal);
      }
    } finally {
      pad.dataset['presenting'] = 'false';
      delete root.dataset['stepValue'];
    }
  }

  captureStep(signal: AbortSignal): Promise<CaptureResult<number[]>> {
    return new Promise<CaptureResult<number[]>>((resolve, reject) => {
      const root = this.#root;
      const pad = this.#pad;
      const services = this.#services;
      if (!root || !pad || !services) {
        reject(new Error('captureStep called before mount'));
        return;
      }
      if (signal.aborted) {
        reject(abortError());
        return;
      }

      root.dataset['armed'] = 'true';
      const taps: number[] = [];
      let lastTimestamp = 0;
      let watchdog = 0;

      const stopWatchdog = (): void => {
        if (watchdog) {
          services.clock.cancel(watchdog);
          watchdog = 0;
        }
      };

      const finish = (): void => {
        stopWatchdog();
        root.dataset['armed'] = 'false';
        const intervals: number[] = [];
        for (let i = 1; i < taps.length; i += 1) intervals.push(taps[i]! - taps[i - 1]!);
        resolve({ value: intervals, meta: { taps: taps.length } });
      };

      // rAF watchdog rather than a timer: same clock as everything else, and it
      // is cancelled outright rather than left to fire after the step is over.
      const watch = (timestamp: number): void => {
        if (timestamp - lastTimestamp >= SILENCE_MS) {
          finish();
          return;
        }
        watchdog = services.clock.frame(watch);
      };

      pad.addEventListener(
        'pointerdown',
        (event: PointerEvent) => {
          event.preventDefault();
          const now = performance.now();
          taps.push(now);
          lastTimestamp = now;
          services.audio.tone({ freq: 660, durationMs: 70, type: 'square', gain: 0.26 });
          pad.dataset['presenting'] = 'true';
          // rAF-driven, abort-aware, and never a stray timer (CANON §10).
          void wait(services.clock, 70, signal).then(
            () => {
              pad.dataset['presenting'] = 'false';
            },
            () => {},
          );

          if (taps.length >= MAX_TAPS) {
            finish();
            return;
          }
          stopWatchdog();
          watchdog = services.clock.frame(watch);
        },
        { signal },
      );

      signal.addEventListener(
        'abort',
        () => {
          stopWatchdog();
          root.dataset['armed'] = 'false';
          reject(abortError());
        },
        { once: true },
      );
    });
  }

  scoreStep(input: CaptureResult<number[]>, expected: number): StepScore {
    return scoreRhythm(input.value, patternFor(expected));
  }
}
