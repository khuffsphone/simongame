// Timing — CANON §10.
//
// The split that matters: **wall-clock for logic, painted frames for anything
// the player must see.**
//
// Deriving durations from requestAnimationFrame quantises every interval to the
// frame rate. At 10 fps nothing resolves faster than 100 ms and a 250 ms beat
// becomes 300 ms. If a scorer then compares against nominal values while the
// presenter rendered stretched ones, the game shows one thing and grades
// another — no input can pass. That is a correctness bug wearing a performance
// bug's clothes, and it only appears on slow devices.
//
// The inverse mistake is just as real: driving a visual cue purely off the wall
// clock lets a stalled frame swallow the cue entirely, so the player is asked to
// reproduce something that was never painted. `waitVisible` exists for that
// case and satisfies both conditions.

/**
 * Opaque timer handle. `setTimeout` returns a number in the DOM and a Timeout
 * object under Node, and the difference leaks into test doubles — so the
 * contract promises only that whatever `timeout` returns is what `clearTimer`
 * accepts.
 */
export type TimerHandle = unknown;

export interface Clock {
  frame(callback: (timestamp: number) => void): number;
  cancel(handle: number): void;
  /** Monotonic wall-clock milliseconds, independent of frame rate. */
  now(): number;
  timeout(callback: () => void, ms: number): TimerHandle;
  clearTimer(handle: TimerHandle): void;
}

export const rafClock: Clock = {
  frame: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
  now: () => performance.now(),
  timeout: (callback, ms) => setTimeout(callback, ms),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function abortError(reason = 'Aborted'): DOMException {
  return new DOMException(reason, 'AbortError');
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}

/**
 * Wall-clock wait. Use for game logic — pacing gaps, capture timeouts, holds.
 *
 * Cancellation is total: the timer is cleared and the abort listener removed, so
 * nothing survives to fire later. That discipline is what rAF gave us for free
 * and is the price of moving off it.
 */
export function wait(clock: Clock, ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }

    let handle: TimerHandle = null;
    const cleanup = (): void => {
      clock.clearTimer(handle);
      signal.removeEventListener('abort', onAbort);
    };

    function onAbort(): void {
      cleanup();
      reject(abortError());
    }

    signal.addEventListener('abort', onAbort, { once: true });
    handle = clock.timeout(() => {
      cleanup();
      resolve();
    }, ms);
  });
}

/** Minimum painted frames a visual cue must survive to count as shown. */
export const DEFAULT_MIN_FRAMES = 2;

/**
 * Wait for a cue the player must actually perceive.
 *
 * Resolves once **both** conditions hold: `ms` of wall-clock time has passed,
 * and at least `minFrames` animation frames have painted. A stall can therefore
 * stretch a cue — which is honest, the player really did see it late — but can
 * never erase it.
 *
 * Resolves with the timestamp of the first painted frame, which is the true
 * onset of the cue. Anything scored against a rendered performance should use
 * that rather than the nominal schedule.
 */
export function waitVisible(
  clock: Clock,
  ms: number,
  signal: AbortSignal,
  minFrames: number = DEFAULT_MIN_FRAMES,
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }

    const start = clock.now();
    let firstPaintAt: number | null = null;
    let framesPainted = 0;
    let frameHandle = 0;
    let timerHandle: TimerHandle = null;
    let elapsed = false;
    let settled = false;

    const cleanup = (): void => {
      clock.cancel(frameHandle);
      clock.clearTimer(timerHandle);
      signal.removeEventListener('abort', onAbort);
    };

    function onAbort(): void {
      cleanup();
      reject(abortError());
    }

    const settle = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(firstPaintAt ?? start);
    };

    const tick = (): void => {
      framesPainted += 1;
      if (firstPaintAt === null) firstPaintAt = clock.now();
      if (elapsed && framesPainted >= minFrames) {
        settle();
        return;
      }
      frameHandle = clock.frame(tick);
    };

    signal.addEventListener('abort', onAbort, { once: true });
    frameHandle = clock.frame(tick);
    timerHandle = clock.timeout(() => {
      elapsed = true;
      if (framesPainted >= minFrames) settle();
    }, ms);
  });
}
