import { createSilentAudioService } from '../../src/core/audio';
import { Engine, type EngineEvents, type VisibilityHost } from '../../src/core/engine';
import { ModalityRegistry } from '../../src/core/registry';
import { ScriptedModality } from './scripted-modality';

/** A visibility source the test drives, standing in for `document`. */
export class FakeVisibility implements VisibilityHost {
  hidden = false;
  readonly #listeners = new Set<() => void>();

  addEventListener(_type: 'visibilitychange', listener: () => void): void {
    this.#listeners.add(listener);
  }

  removeEventListener(_type: 'visibilitychange', listener: () => void): void {
    this.#listeners.delete(listener);
  }

  get listenerCount(): number {
    return this.#listeners.size;
  }

  /** Flip visibility and dispatch, exactly as the browser would. */
  set(hidden: boolean): void {
    this.hidden = hidden;
    for (const listener of [...this.#listeners]) listener();
  }
}

export interface Harness {
  engine: Engine;
  stage: HTMLElement;
  visibility: FakeVisibility;
  modality: ScriptedModality;
  events: RecordedEvents;
  dispose(): void;
}

export interface RecordedEvents {
  states: string[];
  fails: EngineEvents['fail'][];
  scores: EngineEvents['score'][];
  levelUps: EngineEvents['levelUp'][];
  quotas: EngineEvents['quota'][];
}

export function createHarness(
  options: { pinnedSeed?: number; levelUpHoldMs?: number } = {},
): Harness {
  ScriptedModality.reset();

  const stage = document.createElement('div');
  document.body.append(stage);

  const registry = new ModalityRegistry().register(ScriptedModality);
  const visibility = new FakeVisibility();

  const engine = new Engine({
    registry,
    stage,
    audio: createSilentAudioService('running'),
    visibility,
    pinnedSeed: options.pinnedSeed ?? 20260814,
    levelUpHoldMs: options.levelUpHoldMs ?? 100,
  });

  const events: RecordedEvents = { states: [], fails: [], scores: [], levelUps: [], quotas: [] };
  engine.events.on('state', ({ state }) => events.states.push(state));
  engine.events.on('fail', (payload) => events.fails.push(payload));
  engine.events.on('score', (payload) => events.scores.push(payload));
  engine.events.on('levelUp', (payload) => events.levelUps.push(payload));
  engine.events.on('quota', (payload) => events.quotas.push(payload));

  engine.mount();

  const modality = ScriptedModality.instances[0]!;

  return {
    engine,
    stage,
    visibility,
    modality,
    events,
    dispose: () => {
      engine.destroy();
      stage.remove();
    },
  };
}

/**
 * Reproduce the presented sequence back to the engine.
 *
 * `presented` accumulates across levels and replays, so the offset is re-based
 * on every `level` event — which the engine also emits for a replay.
 */
export function autoPlay(
  engine: Engine,
  modality: ScriptedModality,
  options: { wrongAt?: number; stallAt?: number } = {},
): void {
  let base = 0;
  engine.events.on('level', () => {
    base = modality.presented.length;
  });
  engine.events.on('capture', ({ index }) => {
    if (options.stallAt === index) return;
    const expected = modality.presented[base + index];
    if (expected === undefined) return;
    const value =
      options.wrongAt === index ? (expected + 1) % ScriptedModality.cardinality : expected;
    // captureStep is invoked synchronously right after this event, so the
    // resolver exists by the time this microtask runs.
    queueMicrotask(() => modality.push(value));
  });
}
