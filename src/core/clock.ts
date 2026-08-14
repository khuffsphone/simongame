// All waiting in MODESHIFT is rAF-driven — CANON §10. There is no setTimeout
// in the game loop, and elapsed time comes from the timestamp rAF hands the
// callback rather than from a separate clock read.

export interface Clock {
  frame(callback: (timestamp: number) => void): number;
  cancel(handle: number): void;
}

export const rafClock: Clock = {
  frame: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
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
 * Resolve after `ms` of animation-frame time, or reject with AbortError.
 *
 * Cancellation is total: the frame handle is cancelled and the abort listener
 * removed, so nothing survives to fire later. This is what makes the "no
 * phantom timeout" invariant (CANON §7) hold across a pause.
 */
export function wait(clock: Clock, ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }

    let start: number | null = null;
    let handle = 0;

    const cleanup = (): void => {
      signal.removeEventListener('abort', onAbort);
    };

    function onAbort(): void {
      clock.cancel(handle);
      cleanup();
      reject(abortError());
    }

    const tick = (timestamp: number): void => {
      if (start === null) start = timestamp;
      if (timestamp - start >= ms) {
        cleanup();
        resolve();
        return;
      }
      handle = clock.frame(tick);
    };

    signal.addEventListener('abort', onAbort, { once: true });
    handle = clock.frame(tick);
  });
}
