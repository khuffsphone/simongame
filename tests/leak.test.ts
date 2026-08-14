import { afterEach, describe, expect, it } from 'vitest';
import { createSilentAudioService } from '../src/core/audio';
import type { Clock } from '../src/core/clock';
import { Engine } from '../src/core/engine';
import { stepsForLevel } from '../src/core/progression';
import { ModalityRegistry } from '../src/core/registry';
import { ColorModality } from '../src/modalities';

// CANON §10 / §13: after 50 simulated levels, live AbortController and DOM
// listener counts must be back at baseline.
//
// This runs the real ColorModality — real DOM, real pointerdown listeners —
// because the listener lifetime being measured lives in the modality, not in
// the engine.

const LEVELS = 50;

/**
 * A clock whose every frame jumps far enough to satisfy any single wait, so a
 * 50-level run completes in milliseconds. Frames are microtasks, which is why
 * the run must be stopped explicitly (see the levelUp listener below) — an
 * unbounded engine loop would starve the macrotask queue.
 */
function createTurboClock(msPerFrame = 4000): Clock {
  let now = 0;
  let nextHandle = 1;
  const pending = new Map<number, (timestamp: number) => void>();

  return {
    frame(callback) {
      const handle = nextHandle;
      nextHandle += 1;
      pending.set(handle, callback);
      queueMicrotask(() => {
        const fn = pending.get(handle);
        if (!fn) return;
        pending.delete(handle);
        now += msPerFrame;
        fn(now);
      });
      return handle;
    },
    cancel(handle) {
      pending.delete(handle);
    },
    now() {
      return now;
    },
    // Wall-clock waits collapse to a microtask so 50 levels still run fast.
    timeout(callback, _ms) {
      const handle = nextHandle;
      nextHandle += 1;
      pending.set(handle, () => callback());
      queueMicrotask(() => {
        const fn = pending.get(handle);
        if (!fn) return;
        pending.delete(handle);
        now += msPerFrame;
        callback();
      });
      return handle;
    },
    clearTimer(handle) {
      pending.delete(handle as number);
    },
  };
}

interface ListenerEntry {
  target: EventTarget;
  type: string;
  signal: AbortSignal | null;
  removed: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wrapped: any;
}

/**
 * Counts DOM listeners that are genuinely still registered.
 *
 * Naive add/remove counting reports leaks that do not exist, because there are
 * two ways a listener can go away without a `removeEventListener` call:
 *
 *  - `{ signal }` — the browser drops it when the signal aborts;
 *  - `{ once: true }` — the browser drops it after the first dispatch.
 *
 * Both are load-bearing in MODESHIFT, so both are accounted for: signal-bound
 * entries are checked against `signal.aborted`, and once-listeners are wrapped
 * so their first invocation marks the entry dead.
 */
function instrumentListeners(): { live: () => number; restore: () => void } {
  const originalAdd = EventTarget.prototype.addEventListener;
  const originalRemove = EventTarget.prototype.removeEventListener;
  const entries: ListenerEntry[] = [];
  const byListener = new Map<object, ListenerEntry[]>();

  EventTarget.prototype.addEventListener = function patchedAdd(
    this: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (!listener) {
      originalAdd.call(this, type, listener, options as AddEventListenerOptions);
      return;
    }

    const opts = typeof options === 'object' && options !== null ? options : {};
    const entry: ListenerEntry = {
      target: this,
      type,
      signal: opts.signal ?? null,
      removed: false,
      wrapped: listener,
    };

    if (opts.once === true) {
      const inner = listener;
      entry.wrapped = function onceWrapper(this: unknown, event: Event): void {
        entry.removed = true;
        if (typeof inner === 'function') inner.call(this, event);
        else inner.handleEvent(event);
      };
    }

    entries.push(entry);
    const siblings = byListener.get(listener) ?? [];
    siblings.push(entry);
    byListener.set(listener, siblings);

    originalAdd.call(this, type, entry.wrapped, options as AddEventListenerOptions);
  };

  EventTarget.prototype.removeEventListener = function patchedRemove(
    this: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void {
    if (!listener) {
      originalRemove.call(this, type, listener, options as EventListenerOptions);
      return;
    }
    const entry = byListener
      .get(listener)
      ?.find((candidate) => candidate.target === this && candidate.type === type && !candidate.removed);
    if (entry) {
      entry.removed = true;
      originalRemove.call(this, type, entry.wrapped, options as EventListenerOptions);
      return;
    }
    originalRemove.call(this, type, listener, options as EventListenerOptions);
  };

  return {
    live: () =>
      entries.filter((entry) => !entry.removed && !(entry.signal?.aborted ?? false)).length,
    restore: () => {
      EventTarget.prototype.addEventListener = originalAdd;
      EventTarget.prototype.removeEventListener = originalRemove;
    },
  };
}

/** Records what was presented, so the test can tap the right pad back. */
class ProbeColorModality extends ColorModality {
  static presented: number[] = [];

  static resetProbe(): void {
    ProbeColorModality.presented = [];
  }

  override async presentStep(
    value: number,
    durationMs: number,
    signal: AbortSignal,
  ): Promise<void> {
    ProbeColorModality.presented.push(value);
    await super.presentStep(value, durationMs, signal);
  }
}

/** Tap the pad carrying `value`. jsdom may not ship PointerEvent; MouseEvent
 * travels the identical dispatch path. */
function dispatchTap(stage: HTMLElement, value: number): void {
  const pad = stage.querySelector<HTMLButtonElement>(
    `.grid--color .grid__pad[data-value="${value}"]`,
  );
  const Ctor =
    (globalThis as unknown as { PointerEvent?: typeof MouseEvent }).PointerEvent ?? MouseEvent;
  pad?.dispatchEvent(new Ctor('pointerdown', { bubbles: true, cancelable: true }));
}

let cleanup: (() => void) | null = null;

afterEach(() => {
  cleanup?.();
  cleanup = null;
});

describe('leak check: 50 simulated levels', () => {
  it('returns AbortController and DOM listener counts to baseline', async () => {
    ProbeColorModality.resetProbe();

    const instrumentation = instrumentListeners();
    const stage = document.createElement('div');
    document.body.append(stage);

    const engine = new Engine({
      registry: new ModalityRegistry().register(ProbeColorModality),
      stage,
      audio: createSilentAudioService('running'),
      clock: createTurboClock(),
      pinnedSeed: 424242,
      levelUpHoldMs: 1,
    });

    cleanup = () => {
      engine.destroy();
      stage.remove();
      instrumentation.restore();
    };

    engine.mount();

    // jsdom lazily installs its own document-level mouseover/mouseout handlers
    // on the first mouse dispatch. Warm that up before taking the baseline, so
    // the comparison measures MODESHIFT's listeners and not jsdom's.
    dispatchTap(stage, 0);
    const baselineListeners = instrumentation.live();
    const baselineControllers = engine.liveControllerCount;

    // Reproduce the presented sequence by tapping real pads.
    let base = 0;
    engine.events.on('level', () => {
      base = ProbeColorModality.presented.length;
    });
    engine.events.on('capture', ({ index }) => {
      const expected = ProbeColorModality.presented[base + index];
      if (expected === undefined) return;
      queueMicrotask(() => dispatchTap(stage, expected));
    });

    const controllerSamples: number[] = [];
    const listenerSamples: number[] = [];
    const done = new Promise<void>((resolve) => {
      engine.events.on('levelUp', ({ level }) => {
        controllerSamples.push(engine.liveControllerCount);
        listenerSamples.push(instrumentation.live());
        if (level >= LEVELS) {
          // Stops the otherwise-unbounded loop so the microtask queue drains.
          engine.destroy();
          resolve();
        }
      });
      engine.events.on('fail', () => resolve());
    });

    engine.start();
    await done;
    // destroy() resolves `done` from inside the levelUp dispatch, so the run
    // loop is still unwinding. Wait for it before measuring.
    await engine.finished;

    // The run really happened: 50 levels cleared, no fail.
    expect(controllerSamples).toHaveLength(LEVELS);
    expect(engine.createdControllerCount).toBeGreaterThan(1000);
    const expectedSteps = Array.from({ length: LEVELS }, (_, i) => stepsForLevel(i + 1)).reduce(
      (sum, n) => sum + n,
      0,
    );
    expect(ProbeColorModality.presented.length).toBe(expectedSteps);

    // Flat, not growing: the count at level 50 equals the count at level 2.
    expect(new Set(controllerSamples)).toEqual(new Set([0]));
    expect(new Set(listenerSamples).size).toBe(1);
    expect(listenerSamples[0]).toBe(baselineListeners);

    expect(engine.liveControllerCount).toBe(baselineControllers);
    expect(instrumentation.live()).toBe(baselineListeners);
  }, 30_000);
});
