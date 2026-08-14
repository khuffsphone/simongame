import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdaptiveProfile } from '../src/core/adaptive';
import { createSilentAudioService } from '../src/core/audio';
import { Engine } from '../src/core/engine';
import { ModalityRegistry } from '../src/core/registry';
import { autoPlay, createHarness, type Harness } from './helpers/harness';
import { ScriptedModality } from './helpers/scripted-modality';

// Integration tests. Fake timers drive rAF, so the whole rAF-based timing model
// (CANON §10) is exercised rather than stubbed out.
//
// Level 1 is 3 steps at an 800 ms pace with a 200 ms gap => 3000 ms of
// presentation before capture opens. ScriptedModality's capture timeout is
// 1000 ms.

const LEVEL_1_PRESENTATION_MS = 3 * (800 + 200);

let harness: Harness | null = null;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  harness?.dispose();
  harness = null;
  vi.useRealTimers();
});

describe('audio gate (CANON §9)', () => {
  it('refuses to start while the context is not running', () => {
    const stage = document.createElement('div');
    document.body.append(stage);
    const engine = new Engine({
      registry: new ModalityRegistry().register(ScriptedModality),
      stage,
      audio: createSilentAudioService('suspended'),
    });
    engine.mount();

    expect(() => engine.start()).toThrow(/audio context is running/i);
    expect(engine.state).toBe('BOOT');

    engine.destroy();
    stage.remove();
  });
});

describe('a full level run', () => {
  it('presents, captures, scores, and levels up', async () => {
    harness = createHarness();
    autoPlay(harness.engine, harness.modality);

    harness.engine.start();
    await vi.advanceTimersByTimeAsync(LEVEL_1_PRESENTATION_MS + 400);

    expect(harness.modality.presented.slice(0, 3)).toHaveLength(3);
    expect(harness.events.scores.slice(0, 3).every((s) => s.pass)).toBe(true);
    expect(harness.events.levelUps[0]).toEqual({ level: 1, next: 2 });
    expect(harness.engine.level).toBe(2);
    expect(harness.events.fails).toEqual([]);
  });

  it('walks the canonical state path', async () => {
    harness = createHarness();
    autoPlay(harness.engine, harness.modality);

    harness.engine.start();
    await vi.advanceTimersByTimeAsync(LEVEL_1_PRESENTATION_MS + 400);

    const first = harness.events.states.slice(0, 5);
    expect(first).toEqual(['LEVEL_SETUP', 'PRESENTING', 'CAPTURING', 'SCORING', 'CAPTURING']);
    expect(harness.events.states).toContain('LEVEL_UP');
  });

  it('is reproducible for a pinned seed', async () => {
    const a = createHarness({ pinnedSeed: 4242 });
    autoPlay(a.engine, a.modality);
    a.engine.start();
    await vi.advanceTimersByTimeAsync(LEVEL_1_PRESENTATION_MS + 400);
    const first = [...a.modality.presented];
    a.dispose();

    const b = createHarness({ pinnedSeed: 4242 });
    autoPlay(b.engine, b.modality);
    b.engine.start();
    await vi.advanceTimersByTimeAsync(LEVEL_1_PRESENTATION_MS + 400);
    expect(b.modality.presented).toEqual(first);
    b.dispose();
  });
});

describe('fail model (CANON §6)', () => {
  it('early-fails on the first wrong step and scores nothing after it', async () => {
    harness = createHarness();
    autoPlay(harness.engine, harness.modality, { wrongAt: 0 });

    harness.engine.start();
    await vi.advanceTimersByTimeAsync(LEVEL_1_PRESENTATION_MS + 400);

    expect(harness.events.scores).toHaveLength(1);
    expect(harness.events.scores[0]?.pass).toBe(false);
    expect(harness.events.fails).toEqual([{ reason: 'wrong-step', level: 1, seed: 20260814 }]);
    expect(harness.engine.state).toBe('FAIL');
  });

  it('fails on a capture timeout', async () => {
    harness = createHarness();
    autoPlay(harness.engine, harness.modality, { stallAt: 0 });

    harness.engine.start();
    await vi.advanceTimersByTimeAsync(LEVEL_1_PRESENTATION_MS + 1200);

    expect(harness.events.scores).toEqual([]);
    expect(harness.events.fails[0]?.reason).toBe('timeout');
    expect(harness.engine.state).toBe('FAIL');
  });

  it('leaves no live controllers behind after a fail', async () => {
    harness = createHarness();
    autoPlay(harness.engine, harness.modality, { wrongAt: 0 });
    harness.engine.start();
    await vi.advanceTimersByTimeAsync(LEVEL_1_PRESENTATION_MS + 400);

    expect(harness.engine.state).toBe('FAIL');
    expect(harness.engine.liveControllerCount).toBe(0);
  });
});

describe('abort (CANON §10)', () => {
  it('aborts mid-presentation and pauses', async () => {
    harness = createHarness();
    autoPlay(harness.engine, harness.modality);
    harness.engine.start();

    await vi.advanceTimersByTimeAsync(1200);
    expect(harness.engine.state).toBe('PRESENTING');

    harness.visibility.set(true);
    await vi.advanceTimersByTimeAsync(50);

    expect(harness.engine.state).toBe('PAUSED');
    // The quota is consumed on resume, not on hide (decisions/0005).
    expect(harness.engine.replaysRemaining).toBe(1);
  });

  it('aborts mid-capture and pauses', async () => {
    harness = createHarness();
    autoPlay(harness.engine, harness.modality, { stallAt: 0 });
    harness.engine.start();

    await vi.advanceTimersByTimeAsync(LEVEL_1_PRESENTATION_MS + 200);
    expect(harness.engine.state).toBe('CAPTURING');
    expect(harness.modality.awaitingInput).toBe(true);

    harness.visibility.set(true);
    await vi.advanceTimersByTimeAsync(50);

    expect(harness.engine.state).toBe('PAUSED');
    expect(harness.modality.awaitingInput).toBe(false);
  });
});

describe('focus-loss recovery (CANON §7)', () => {
  it('resumes with a replay of the same sequence and no phantom timeout', async () => {
    harness = createHarness();
    const active = harness;

    // Answer every step except the last one of the first pass, so the engine is
    // genuinely sitting in CAPTURING with a live timeout when we background.
    let stalledOnce = false;
    let base = 0;
    active.engine.events.on('level', () => {
      base = active.modality.presented.length;
    });
    active.engine.events.on('capture', ({ index }) => {
      if (!stalledOnce && index === 2) {
        stalledOnce = true;
        return;
      }
      const value = active.modality.presented[base + index];
      if (value === undefined) return;
      queueMicrotask(() => active.modality.push(value));
    });

    active.engine.start();

    // Reach capture, then background partway into the 1000 ms capture window.
    await vi.advanceTimersByTimeAsync(LEVEL_1_PRESENTATION_MS + 200);
    expect(harness.engine.state).toBe('CAPTURING');
    expect(harness.events.scores).toHaveLength(2);
    const presentedFirstPass = harness.modality.presented.slice(0, 3);

    harness.visibility.set(true);
    await vi.advanceTimersByTimeAsync(50);
    expect(harness.engine.state).toBe('PAUSED');

    // Far past the capture timeout that was armed before the pause. If any
    // timer survived the abort, this is where it would fire.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(harness.engine.state).toBe('PAUSED');
    expect(harness.events.fails).toEqual([]);

    harness.visibility.set(false);
    await vi.advanceTimersByTimeAsync(LEVEL_1_PRESENTATION_MS + 400);

    // The replay re-presents the identical sequence rather than regenerating it.
    expect(harness.modality.presented.slice(3, 6)).toEqual(presentedFirstPass);
    expect(harness.engine.replaysRemaining).toBe(0);
    expect(harness.engine.level).toBe(2);
    expect(harness.events.fails).toEqual([]);
  });

  it('ends the run on the second backgrounding', async () => {
    harness = createHarness();
    autoPlay(harness.engine, harness.modality);
    harness.engine.start();

    await vi.advanceTimersByTimeAsync(1200);
    harness.visibility.set(true);
    await vi.advanceTimersByTimeAsync(50);
    expect(harness.engine.state).toBe('PAUSED');

    harness.visibility.set(false);
    await vi.advanceTimersByTimeAsync(1200);
    expect(harness.engine.state).toBe('PRESENTING');
    expect(harness.engine.replaysRemaining).toBe(0);

    harness.visibility.set(true);
    await vi.advanceTimersByTimeAsync(50);

    expect(harness.engine.state).toBe('FAIL');
    expect(harness.events.fails[0]?.reason).toBe('focus-lost');
    expect(harness.engine.liveControllerCount).toBe(0);
  });

  it('ignores backgrounding while not in play', async () => {
    harness = createHarness();
    harness.visibility.set(true);
    harness.visibility.set(false);
    await vi.advanceTimersByTimeAsync(50);
    expect(harness.engine.state).toBe('BOOT');
  });
});

describe('quotas surfaced to the UI (CANON §7)', () => {
  it('reports both quotas at level setup', async () => {
    harness = createHarness();
    autoPlay(harness.engine, harness.modality);
    harness.engine.start();
    await vi.advanceTimersByTimeAsync(100);

    expect(harness.events.quotas[0]).toEqual({ replays: 1, retries: 1 });
  });

  it('resets the per-level retry quota on every level', async () => {
    harness = createHarness();
    autoPlay(harness.engine, harness.modality);
    harness.engine.start();
    await vi.advanceTimersByTimeAsync(LEVEL_1_PRESENTATION_MS + 400);

    expect(harness.engine.level).toBe(2);
    expect(harness.engine.retriesRemaining).toBe(1);
    expect(harness.events.quotas.length).toBeGreaterThanOrEqual(2);
  });
});

describe('adaptive assist (CANON §4b)', () => {
  const struggling = createAdaptiveProfile({
    scripted: { attempts: 40, passes: 0, accuracyTotal: 0 },
  });
  const solved = createAdaptiveProfile({
    scripted: { attempts: 40, passes: 40, accuracyTotal: 40 },
  });

  it('is off by default: no profile presents exactly the canonical pace', async () => {
    harness = createHarness();
    autoPlay(harness.engine, harness.modality);
    harness.engine.start();
    await vi.advanceTimersByTimeAsync(LEVEL_1_PRESENTATION_MS + 400);

    expect(harness.modality.durations.slice(0, 3)).toEqual([800, 800, 800]);
  });

  it('shows a struggling modality for longer', async () => {
    harness = createHarness({ adaptive: struggling });
    autoPlay(harness.engine, harness.modality);
    harness.engine.start();
    await vi.advanceTimersByTimeAsync(LEVEL_1_PRESENTATION_MS * 2);

    // MAX_ASSIST at a 0% pass rate: 800 * 1.35.
    expect(harness.modality.durations.slice(0, 3)).toEqual([1080, 1080, 1080]);
  });

  it('shows a solved modality for less, and never below its perception floor', async () => {
    harness = createHarness({ adaptive: solved });
    autoPlay(harness.engine, harness.modality);
    harness.engine.start();
    await vi.advanceTimersByTimeAsync(LEVEL_1_PRESENTATION_MS + 400);

    expect(harness.modality.durations.slice(0, 3)).toEqual([720, 720, 720]);
    for (const duration of harness.modality.durations) {
      expect(duration).toBeGreaterThanOrEqual(ScriptedModality.minPresentMs);
    }
  });

  it('does not change how many steps the level has', async () => {
    // The whole point: assist moves time, never the task. Same seed, same
    // level, same sequence — only the clock differs.
    const plain = createHarness();
    autoPlay(plain.engine, plain.modality);
    plain.engine.start();
    await vi.advanceTimersByTimeAsync(LEVEL_1_PRESENTATION_MS + 400);
    const plainSequence = plain.modality.presented.slice(0, 3);
    const plainSteps = plain.events.levels[0]!.steps;
    plain.dispose();

    harness = createHarness({ adaptive: struggling });
    autoPlay(harness.engine, harness.modality);
    harness.engine.start();
    await vi.advanceTimersByTimeAsync(LEVEL_1_PRESENTATION_MS * 2);

    expect(harness.modality.presented.slice(0, 3)).toEqual(plainSequence);
    expect(harness.events.levels[0]!.steps).toBe(plainSteps);
  });

  it('extends the answer clock for a struggling modality', async () => {
    harness = createHarness({ adaptive: struggling });
    // Never answer: the only thing that can end this level is the timeout.
    harness.engine.start();
    await vi.advanceTimersByTimeAsync(3 * (1080 + 200) + 20);
    expect(harness.engine.state).toBe('CAPTURING');

    // The unassisted deadline is 1000 ms. Past it, still alive.
    await vi.advanceTimersByTimeAsync(1100);
    expect(harness.events.fails).toEqual([]);

    // The assisted deadline is 1350 ms.
    await vi.advanceTimersByTimeAsync(400);
    expect(harness.events.fails[0]?.reason).toBe('timeout');
  });

  it('never shortens the answer clock for a solved modality', async () => {
    harness = createHarness({ adaptive: solved });
    harness.engine.start();
    await vi.advanceTimersByTimeAsync(3 * (720 + 200) + 20);
    expect(harness.engine.state).toBe('CAPTURING');

    // Presentation tightened to 0.9x, but the answer clock is still the full
    // 1000 ms — competence is not punished with a shorter fuse.
    await vi.advanceTimersByTimeAsync(940);
    expect(harness.events.fails).toEqual([]);
    await vi.advanceTimersByTimeAsync(120);
    expect(harness.events.fails[0]?.reason).toBe('timeout');
  });

  it('discloses the assist on every level event', async () => {
    harness = createHarness({ adaptive: struggling });
    autoPlay(harness.engine, harness.modality);
    harness.engine.start();
    await vi.advanceTimersByTimeAsync(100);

    expect(harness.events.levels[0]?.assisted).toEqual(['scripted']);
  });

  it('discloses nothing when the assist is off', async () => {
    harness = createHarness({ adaptive: solved });
    autoPlay(harness.engine, harness.modality);
    harness.engine.start();
    await vi.advanceTimersByTimeAsync(100);

    // Tightened, not assisted: `assisted` is the list of modalities being
    // *helped*, and claiming help that is not being given would be a lie.
    expect(harness.events.levels[0]?.assisted).toEqual([]);
  });
});
