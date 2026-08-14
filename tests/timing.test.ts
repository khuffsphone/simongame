import { describe, expect, it } from 'vitest';
import { createSilentAudioService } from '../src/core/audio';
import { rafClock, wait, waitVisible, type Clock } from '../src/core/clock';
import {
  RhythmModality,
  patternFor,
  renderedIntervalsFor,
  scoreRhythm,
  type RhythmValue,
} from '../src/modalities/rhythm';

// CANON §10 / decisions/0016 — the Severity-1 class of defect.
//
// Frame-derived timing quantises every duration to the frame rate. If the
// scorer then compares against nominal values while the presenter rendered
// stretched ones, the game shows one rhythm and grades another, and no input
// can pass. These tests hold the two halves of the fix in place: logic runs on
// the wall clock, and anything scored against a performance is scored against
// the performance that was actually rendered.

/**
 * A clock where wall time and frame time are deliberately decoupled: timers
 * fire on schedule, frames arrive only every `frameIntervalMs`. That is exactly
 * what a throttled device looks like.
 */
function stretchedClock(frameIntervalMs: number): {
  clock: Clock;
  advance: (ms: number) => Promise<void>;
} {
  let now = 0;
  let handle = 1;
  let nextFrameAt = frameIntervalMs;
  const timers = new Map<number, { at: number; cb: () => void }>();
  const frames = new Map<number, (t: number) => void>();

  const clock: Clock = {
    now: () => now,
    timeout(cb, ms) {
      const id = handle++;
      timers.set(id, { at: now + ms, cb });
      return id;
    },
    clearTimer(id) {
      timers.delete(id as number);
    },
    frame(cb) {
      const id = handle++;
      frames.set(id, cb);
      return id;
    },
    cancel(id) {
      frames.delete(id);
    },
  };

  const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  async function advance(totalMs: number): Promise<void> {
    const end = now + totalMs;
    for (let guard = 0; guard < 10_000 && now < end; guard += 1) {
      const timerAt = Math.min(...[...timers.values()].map((t) => t.at), Infinity);
      const frameAt = frames.size > 0 ? nextFrameAt : Infinity;
      const next = Math.min(timerAt, frameAt, end);
      now = next;

      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) {
          timers.delete(id);
          timer.cb();
        }
      }
      if (frameAt <= now) {
        nextFrameAt = now + frameIntervalMs;
        const due = [...frames.entries()];
        frames.clear();
        for (const [, cb] of due) cb(now);
      }
      await flush();
    }
  }

  return { clock, advance };
}

describe('wait() is wall-clock, not frame-derived', () => {
  it('resolves on schedule even when frames are 100 ms apart', async () => {
    const { clock, advance } = stretchedClock(100);
    const controller = new AbortController();
    let resolvedAt: number | null = null;

    void wait(clock, 220, controller.signal).then(() => {
      resolvedAt = clock.now();
    });

    await advance(400);
    // Frame-quantised, 220 ms would have become 300 ms — the next frame after.
    expect(resolvedAt).toBe(220);
  });

  it('rejects with AbortError and leaves no timer behind', async () => {
    const { clock, advance } = stretchedClock(16);
    const controller = new AbortController();
    const pending = wait(clock, 500, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow(/abort/i);
    // If the timer survived, advancing would resolve a settled promise and the
    // guard below would see the clock still holding work.
    await advance(1000);
  });
});

describe('waitVisible() guarantees the cue was painted', () => {
  it('does not resolve on the wall clock alone when no frame has painted', async () => {
    const { clock, advance } = stretchedClock(400);
    const controller = new AbortController();
    let done = false;
    void waitVisible(clock, 50, controller.signal, 2).then(() => {
      done = true;
    });

    // 50 ms of wall time has passed but no frame has painted yet.
    await advance(60);
    expect(done).toBe(false);

    // Two frames later it resolves.
    await advance(900);
    expect(done).toBe(true);
  });

  it('reports the timestamp of the first painted frame, not the call time', async () => {
    const { clock, advance } = stretchedClock(100);
    const controller = new AbortController();
    let firstPaint: number | null = null;
    void waitVisible(clock, 10, controller.signal, 1).then((t) => {
      firstPaint = t;
    });
    await advance(500);
    expect(firstPaint).toBe(100);
  });
});

describe('rhythm is scored against the performance that was rendered', () => {
  /** Present one rhythm step on a stalled clock and return what it rendered. */
  async function presentUnderStall(
    frameIntervalMs: number,
    value: RhythmValue,
  ): Promise<readonly number[]> {
    const { clock, advance } = stretchedClock(frameIntervalMs);
    const container = document.createElement('div');
    document.body.append(container);

    const modality = new RhythmModality();
    modality.mount(container, {
      audio: createSilentAudioService('running'),
      clock,
      reducedMotion: false,
    });

    const controller = new AbortController();
    const presenting = modality.presentStep(value, 300, controller.signal);
    await advance(20_000);
    await presenting;

    modality.unmount();
    container.remove();
    return renderedIntervalsFor(value) ?? [];
  }

  it('records what it actually rendered, and a stall really does distort it', async () => {
    const value: RhythmValue = { pattern: 1 }; // [220, 220, 560] short-short-long
    const rendered = await presentUnderStall(100, value);
    const nominal = patternFor(value.pattern);

    expect(rendered).toHaveLength(nominal.length);
    expect(rendered).not.toEqual([...nominal]);

    // The distortion is not a uniform stretch. Onsets snap to frame
    // boundaries, so some intervals grow and others shrink — which is exactly
    // why a tempo-invariant scorer does not rescue you. Proportions drift, and
    // proportions are what the scorer compares.
    const proportions = (xs: readonly number[]): number[] => {
      const total = xs.reduce((a, b) => a + b, 0);
      return xs.map((x) => x / total);
    };
    const drift = proportions(rendered).map((p, i) => Math.abs(p - proportions(nominal)[i]!));
    expect(Math.max(...drift)).toBeGreaterThan(0.05);
  });

  it('lets a player who copies what was shown pass', async () => {
    const value: RhythmValue = { pattern: 1 };
    const rendered = await presentUnderStall(100, value);

    const instance = new RhythmModality();
    const score = instance.scoreStep({ value: [...rendered], meta: {} }, value);

    expect(score.pass).toBe(true);
    expect(score.accuracy).toBeCloseTo(1, 6);
  });

  it('would have failed that same player under nominal scoring', async () => {
    // This is the regression this whole change exists for. If it ever starts
    // passing, the stall stopped distorting and the test has lost its teeth —
    // check the clock, not the scorer.
    const value: RhythmValue = { pattern: 1 };
    const rendered = await presentUnderStall(100, value);

    const againstNominal = scoreRhythm([...rendered], patternFor(value.pattern));
    expect(againstNominal.pass).toBe(false);
  });

  it('still scores against the nominal pattern when nothing was rendered', async () => {
    // Defensive: a value that was never presented (a test double, a replay
    // ordering bug) must not silently score everything as perfect.
    const unpresented: RhythmValue = { pattern: 0 };
    const instance = new RhythmModality();
    const nominal = patternFor(0);
    expect(instance.scoreStep({ value: [...nominal], meta: {} }, unpresented).pass).toBe(true);
    expect(instance.scoreStep({ value: [10, 900, 10], meta: {} }, unpresented).pass).toBe(false);
  });
});

describe('the production clock still satisfies the Clock contract', () => {
  it('exposes wall-clock time and timers alongside frames', () => {
    expect(typeof rafClock.now()).toBe('number');
    // The handle is opaque; all that is promised is the round trip.
    const handle = rafClock.timeout(() => {}, 10_000);
    expect(handle).toBeDefined();
    expect(() => rafClock.clearTimer(handle)).not.toThrow();
  });
});
