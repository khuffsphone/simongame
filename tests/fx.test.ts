import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Clock } from '../src/core/clock';
import { Fx } from '../src/fx/fx';

// CANON §14: the FX loop must not run when nothing is on screen. These assert
// the lifecycle directly rather than trusting the code comment.

/** jsdom has no 2D canvas; a no-op stub lets the real loop run. */
function stubContext(): CanvasRenderingContext2D {
  const noop = (): void => {};
  return new Proxy({} as CanvasRenderingContext2D, {
    get: (_target, prop) => {
      if (prop === 'canvas') return undefined;
      return noop;
    },
    set: () => true,
  });
}

/** A clock the test steps by hand, so frames are deterministic. */
function manualClock(): Clock & { step(ms: number): void; pending: number } {
  let next = 1;
  let now = 0;
  const queue = new Map<number, (t: number) => void>();
  const timers = new Map<number, { at: number; cb: () => void }>();
  return {
    frame(callback) {
      const handle = next;
      next += 1;
      queue.set(handle, callback);
      return handle;
    },
    cancel(handle) {
      queue.delete(handle);
    },
    now() {
      return now;
    },
    timeout(callback, ms) {
      const handle = next;
      next += 1;
      timers.set(handle, { at: now + ms, cb: callback });
      return handle;
    },
    clearTimer(handle) {
      timers.delete(handle as number);
    },
    step(ms: number) {
      now += ms;
      for (const [handle, timer] of [...timers]) {
        if (timer.at <= now) {
          timers.delete(handle);
          timer.cb();
        }
      }
      const due = [...queue.entries()];
      queue.clear();
      for (const [, cb] of due) cb(now);
    },
    get pending() {
      return queue.size;
    },
  };
}

let fx: Fx | null = null;
afterEach(() => {
  fx?.destroy();
  fx = null;
  vi.restoreAllMocks();
});

function makeFx(reducedMotion = false): { fx: Fx; clock: ReturnType<typeof manualClock> } {
  const clock = manualClock();
  const instance = new Fx({ clock, reducedMotion, contextFactory: () => stubContext() });
  instance.mount();
  fx = instance;
  return { fx: instance, clock };
}

describe('FX lifecycle', () => {
  it('does not loop before anything is emitted', () => {
    const { fx: instance } = makeFx();
    expect(instance.isLooping).toBe(false);
    expect(instance.particleCount).toBe(0);
  });

  it('starts looping when a particle is emitted', () => {
    const { fx: instance } = makeFx();
    instance.spark(100, 100, 5);
    expect(instance.particleCount).toBe(5);
    expect(instance.isLooping).toBe(true);
  });

  it('stops looping once the last particle dies', () => {
    const { fx: instance, clock } = makeFx();
    instance.spark(100, 100, 5);
    expect(instance.isLooping).toBe(true);

    // Spark lifetimes top out well under 1s; step past every one of them.
    for (let i = 0; i < 40 && instance.isLooping; i += 1) clock.step(50);

    expect(instance.particleCount).toBe(0);
    expect(instance.isLooping).toBe(false);
    expect(clock.pending).toBe(0);
  });

  it('clear() empties the field and stops the loop immediately', () => {
    const { fx: instance, clock } = makeFx();
    instance.jackpot(1.5);
    expect(instance.particleCount).toBeGreaterThan(0);
    expect(instance.isLooping).toBe(true);

    instance.clear();

    expect(instance.particleCount).toBe(0);
    expect(instance.isLooping).toBe(false);
    expect(clock.pending).toBe(0);
  });

  it('restarts cleanly after being cleared', () => {
    const { fx: instance } = makeFx();
    instance.jackpot(1);
    instance.clear();
    instance.spark(10, 10, 3);
    expect(instance.isLooping).toBe(true);
    expect(instance.particleCount).toBe(3);
  });
});

describe('FX budget', () => {
  it('never exceeds the particle cap, however hard it is hammered', () => {
    const { fx: instance } = makeFx();
    for (let i = 0; i < 50; i += 1) instance.jackpot(1.6);
    expect(instance.particleCount).toBeLessThanOrEqual(instance.maxParticles);
  });

  it('uses a much smaller cap under prefers-reduced-motion', () => {
    const { fx: reduced } = makeFx(true);
    expect(reduced.maxParticles).toBeLessThan(new Fx().maxParticles);
    for (let i = 0; i < 20; i += 1) reduced.jackpot(1.6);
    expect(reduced.particleCount).toBeLessThanOrEqual(reduced.maxParticles);
  });

  it('caps the device pixel ratio rather than honouring a 3x screen', () => {
    const original = window.devicePixelRatio;
    Object.defineProperty(window, 'devicePixelRatio', { value: 3, configurable: true });
    try {
      const clock = manualClock();
      const instance = new Fx({ clock, contextFactory: () => stubContext() });
      instance.mount();
      fx = instance;
      const canvas = document.querySelector<HTMLCanvasElement>('.fx-canvas')!;
      // 1.5 is the cap; at DPR 3 an uncapped canvas would be 3x the CSS width.
      expect(canvas.width).toBeLessThanOrEqual(Math.ceil(window.innerWidth * 1.5));
    } finally {
      Object.defineProperty(window, 'devicePixelRatio', { value: original, configurable: true });
    }
  });

  it('draws without ever setting shadowBlur', () => {
    const clock = manualClock();
    const writes: string[] = [];
    const recording = new Proxy({} as CanvasRenderingContext2D, {
      get: () => () => {},
      set: (_t, prop) => {
        writes.push(String(prop));
        return true;
      },
    });
    const instance = new Fx({ clock, contextFactory: () => recording });
    instance.mount();
    fx = instance;
    instance.jackpot(1.6);
    clock.step(16);
    expect(writes.length).toBeGreaterThan(0);
    expect(writes).not.toContain('shadowBlur');
  });
});
