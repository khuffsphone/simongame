import { ControllerRegistry, linkAbort } from './abort';
import { INERT_ADAPTIVE, type AdaptiveProfile } from './adaptive';
import type { AudioService } from './audio';
import { isAbortError, rafClock, wait, type Clock } from './clock';
import { Emitter } from './emitter';
import {
  PRESENT_MULTIPLIER,
  TIMEOUT_MULTIPLIER,
  buildModePlan,
  type Difficulty,
  type GameMode,
} from './modes';
import { gapMsForPace, paceForLevel } from './progression';
import { createRng, randomSeed, type Rng } from './rng';
import type { ModalityRegistry } from './registry';
import type { ModePlan } from './modes';
import type { CaptureResult, Modality, ModalityServices } from './types';

// Engine FSM — CANON §2. The engine owns every state transition, the sequence
// loop, all timing, and all AbortControllers.

export type EngineState =
  | 'BOOT'
  | 'LEVEL_SETUP'
  | 'PRESENTING'
  | 'CAPTURING'
  | 'SCORING'
  | 'LEVEL_UP'
  | 'FAIL'
  | 'PAUSED';

export type FailReason = 'wrong-step' | 'timeout' | 'focus-lost';

export interface SequenceStep {
  readonly modalityId: string;
  readonly value: unknown;
}

// A type alias rather than an interface: only aliases get the implicit index
// signature that satisfies the Emitter's Record constraint.
export type EngineEvents = {
  state: { state: EngineState; previous: EngineState };
  level: {
    level: number;
    steps: number;
    seed: number;
    plan: readonly string[];
    scheduled: string | null;
    substituted: boolean;
    mode: GameMode;
    /** Modalities in this level being given extra time. Never hidden (§4b). */
    assisted: readonly string[];
  };
  present: { index: number; total: number; modalityId: string };
  capture: { index: number; total: number; modalityId: string };
  score: {
    index: number;
    total: number;
    modalityId: string;
    pass: boolean;
    accuracy: number;
    combo: number;
  };
  quota: { replays: number; retries: number };
  levelUp: { level: number; next: number };
  fail: { reason: FailReason; level: number; seed: number };
  error: { error: unknown };
};

/** The slice of `document` the engine needs, so tests can drive visibility. */
export interface VisibilityHost {
  readonly hidden: boolean;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

export interface EngineOptions {
  registry: ModalityRegistry;
  stage: HTMLElement;
  audio: AudioService;
  clock?: Clock;
  visibility?: VisibilityHost;
  /** `?seed=` pins a run; it survives restart so a repro can be replayed. */
  pinnedSeed?: number | null;
  reducedMotion?: boolean;
  /** Celebration beat between clearing a level and setting up the next. */
  levelUpHoldMs?: number;
  mode?: GameMode;
  difficulty?: Difficulty;
  /**
   * Per-modality time assist (CANON §4b). Omit or pass null for a fixed
   * ruleset — the engine's own default adapts nothing.
   */
  adaptive?: AdaptiveProfile | null;
}

/** CANON §7: one focus-lost replay per run, one pointercancel retry per level. */
const REPLAYS_PER_RUN = 1;
const RETRIES_PER_LEVEL = 1;
const DEFAULT_LEVEL_UP_HOLD_MS = 600;

type CaptureOutcome =
  | { kind: 'input'; result: CaptureResult }
  | { kind: 'timeout' }
  | { kind: 'aborted' };

type LevelOutcome = 'clear' | 'fail' | 'interrupted';

export class Engine {
  readonly events = new Emitter<EngineEvents>();

  readonly #registry: ModalityRegistry;
  readonly #stage: HTMLElement;
  readonly #audio: AudioService;
  readonly #clock: Clock;
  readonly #visibility: VisibilityHost | null;
  readonly #pinnedSeed: number | null;
  readonly #mode: GameMode;
  readonly #difficulty: Difficulty;
  readonly #services: ModalityServices;
  readonly #levelUpHoldMs: number;
  readonly #adaptive: AdaptiveProfile;

  readonly #controllers = new ControllerRegistry();
  readonly #instances = new Map<string, Modality>();
  readonly #containers = new Map<string, HTMLElement>();

  // Exactly one owner — this class — creates and nulls each of these.
  #levelController: AbortController | null = null;
  #phaseController: AbortController | null = null;
  #stepController: AbortController | null = null;

  #state: EngineState = 'BOOT';
  #level = 1;
  #seed = 0;
  #rng: Rng = createRng(0);
  #sequence: SequenceStep[] = [];
  #plan: ModePlan | null = null;
  #combo = 0;
  #bestCombo = 0;
  #activeId: string | null = null;

  #replaysRemaining = REPLAYS_PER_RUN;
  #retriesRemaining = RETRIES_PER_LEVEL;

  #alive = false;
  #mounted = false;
  #replaySequence = false;
  #interrupt: 'pause' | 'fail' | null = null;
  #failReason: FailReason = 'wrong-step';
  #resumeResolver: (() => void) | null = null;
  #loop: Promise<void> | null = null;

  constructor(options: EngineOptions) {
    this.#registry = options.registry;
    this.#stage = options.stage;
    this.#audio = options.audio;
    this.#clock = options.clock ?? rafClock;
    this.#visibility = options.visibility ?? null;
    this.#pinnedSeed = options.pinnedSeed ?? null;
    this.#mode = options.mode ?? 'classic';
    this.#difficulty = options.difficulty ?? 'normal';
    this.#levelUpHoldMs = options.levelUpHoldMs ?? DEFAULT_LEVEL_UP_HOLD_MS;
    this.#adaptive = options.adaptive ?? INERT_ADAPTIVE;
    this.#services = {
      audio: options.audio,
      clock: this.#clock,
      reducedMotion: options.reducedMotion ?? false,
    };
  }

  // --- lifecycle ----------------------------------------------------------

  /** Instantiate and mount every registered modality into its own container. */
  mount(): void {
    if (this.#mounted) return;
    for (const ModalityCtor of this.#registry.all()) {
      const container = document.createElement('div');
      container.className = 'mod-root';
      container.dataset['modality'] = ModalityCtor.id;
      this.#stage.append(container);

      const instance = new ModalityCtor();
      instance.mount(container, this.#services);
      instance.deactivate();

      this.#instances.set(ModalityCtor.id, instance);
      this.#containers.set(ModalityCtor.id, container);
    }
    this.#visibility?.addEventListener('visibilitychange', this.#onVisibilityChange);
    this.#mounted = true;
  }

  destroy(): void {
    this.#alive = false;
    this.#resumeResolver?.();
    this.#resumeResolver = null;
    this.#controllers.abortAll();
    this.#levelController = null;
    this.#phaseController = null;
    this.#stepController = null;

    this.#visibility?.removeEventListener('visibilitychange', this.#onVisibilityChange);

    for (const instance of this.#instances.values()) instance.unmount();
    for (const container of this.#containers.values()) container.remove();
    this.#instances.clear();
    this.#containers.clear();

    this.events.clear();
    this.#mounted = false;
    this.#activeId = null;
  }

  /**
   * Begin a run. CANON §2: this is the audio gate — the engine refuses to run
   * at all unless the context is already running, which the UI arranges inside
   * the start gesture.
   */
  start(): void {
    if (!this.#mounted) throw new Error('Engine.mount() must be called before start()');
    if (this.#registry.size === 0) throw new Error('No modalities are registered');
    if (this.#audio.state !== 'running') {
      throw new Error(
        `MODESHIFT cannot start until the audio context is running (state: ${this.#audio.state})`,
      );
    }

    this.#controllers.abortAll();
    this.#levelController = null;
    this.#phaseController = null;
    this.#stepController = null;

    this.#alive = true;
    this.#level = 1;
    this.#seed = this.#pinnedSeed ?? randomSeed();
    this.#rng = createRng(this.#seed);
    this.#replaysRemaining = REPLAYS_PER_RUN;
    this.#retriesRemaining = RETRIES_PER_LEVEL;
    this.#replaySequence = false;
    this.#interrupt = null;
    this.#combo = 0;
    this.#bestCombo = 0;

    this.#loop = this.#runLoop();
  }

  /** Resolves when the current run's loop has finished. Test affordance. */
  get finished(): Promise<void> {
    return this.#loop ?? Promise.resolve();
  }

  // --- observation --------------------------------------------------------

  get state(): EngineState {
    return this.#state;
  }
  get level(): number {
    return this.#level;
  }
  get seed(): number {
    return this.#seed;
  }
  get replaysRemaining(): number {
    return this.#replaysRemaining;
  }
  get retriesRemaining(): number {
    return this.#retriesRemaining;
  }
  get mode(): GameMode {
    return this.#mode;
  }
  get difficulty(): Difficulty {
    return this.#difficulty;
  }
  get combo(): number {
    return this.#combo;
  }
  get bestCombo(): number {
    return this.#bestCombo;
  }
  /** Controllers created but not released. Must return to 0 — CANON §10. */
  get liveControllerCount(): number {
    return this.#controllers.liveCount;
  }
  get createdControllerCount(): number {
    return this.#controllers.createdCount;
  }

  // --- the run loop -------------------------------------------------------

  async #runLoop(): Promise<void> {
    try {
      while (this.#alive) {
        this.#setState('LEVEL_SETUP');
        const levelController = this.#controllers.create();
        this.#levelController = levelController;
        this.#retriesRemaining = RETRIES_PER_LEVEL;
        this.#emitQuota();

        if (this.#replaySequence) {
          // A replay re-presents the existing sequence — regenerating it would
          // consume RNG draws and desynchronize a seeded run (decisions/0005).
          this.#replaySequence = false;
        } else {
          this.#sequence = this.#buildSequence();
        }
        this.#emitLevel();

        const presented = await this.#presentSequence();
        const outcome: LevelOutcome =
          presented === 'interrupted' ? 'interrupted' : await this.#captureSequence();

        this.#deactivateAll();
        this.#levelController = this.#controllers.abortAndRelease(levelController);

        if (!this.#alive) return;

        if (outcome === 'interrupted') {
          const interrupt = this.#interrupt;
          this.#interrupt = null;
          if (interrupt === 'fail') {
            this.#failReason = 'focus-lost';
            this.#enterFail();
            return;
          }
          this.#setState('PAUSED');
          await this.#awaitResume();
          if (!this.#alive) return;
          this.#replaysRemaining -= 1;
          this.#emitQuota();
          this.#replaySequence = true;
          continue;
        }

        if (outcome === 'fail') {
          this.#enterFail();
          return;
        }

        this.#setState('LEVEL_UP');
        this.events.emit('levelUp', { level: this.#level, next: this.#level + 1 });
        await this.#hold(this.#levelUpHoldMs);
        if (!this.#alive) return;
        this.#level += 1;
      }
    } catch (error) {
      this.events.emit('error', { error });
      this.#enterFail();
    } finally {
      this.#loop = null;
    }
  }

  #buildSequence(): SequenceStep[] {
    const plan = buildModePlan(
      this.#mode,
      this.#level,
      this.#rng,
      this.#registry.ids(),
      this.#difficulty,
    );
    this.#plan = plan;
    return plan.steps.map((modalityId) => ({
      modalityId,
      value: this.#registry.require(modalityId).generateValue(this.#rng, this.#level),
    }));
  }

  async #presentSequence(): Promise<'done' | 'interrupted'> {
    this.#setState('PRESENTING');
    const phase = this.#controllers.create();
    this.#phaseController = phase;

    const pace = Math.round(paceForLevel(this.#level) * PRESENT_MULTIPLIER[this.#difficulty]);
    const gap = gapMsForPace(pace);
    const total = this.#sequence.length;

    try {
      for (let index = 0; index < total; index += 1) {
        const step = this.#sequence[index]!;
        const ModalityCtor = this.#registry.require(step.modalityId);
        const instance = this.#instances.get(step.modalityId)!;

        this.#activate(step.modalityId);
        this.events.emit('present', { index, total, modalityId: step.modalityId });

        // The assist scales the duration *after* the perception floor is
        // applied, and can only ever raise it back above that floor — a
        // modality the player has solved is shown for less time, never for
        // less time than it takes to see (CANON §4b).
        const base = Math.max(pace, ModalityCtor.minPresentMs);
        const scaled = Math.round(base * this.#adaptive.presentScaleFor(step.modalityId));
        const durationMs = Math.max(ModalityCtor.minPresentMs, scaled);
        await instance.presentStep(step.value, durationMs, phase.signal);
        await wait(this.#clock, gap, phase.signal);
      }
      return 'done';
    } catch (error) {
      if (isAbortError(error)) return 'interrupted';
      throw error;
    } finally {
      this.#phaseController = this.#controllers.abortAndRelease(phase);
    }
  }

  async #captureSequence(): Promise<LevelOutcome> {
    this.#setState('CAPTURING');
    const phase = this.#controllers.create();
    this.#phaseController = phase;
    const total = this.#sequence.length;

    try {
      for (let index = 0; index < total; index += 1) {
        const step = this.#sequence[index]!;
        const ModalityCtor = this.#registry.require(step.modalityId);
        const instance = this.#instances.get(step.modalityId)!;

        this.#activate(step.modalityId);
        this.events.emit('capture', { index, total, modalityId: step.modalityId });

        // The engine owns the capture timeout: one timer, one clock, one signal
        // (decisions/0008). A modality-owned timer is the phantom-timeout bug.
        const stepController = this.#controllers.create();
        this.#stepController = stepController;
        const unlink = linkAbort(phase.signal, stepController);

        let outcome: CaptureOutcome;
        try {
          outcome = await raceCapture(
            instance,
            stepController.signal,
            this.#clock,
            Math.round(
              ModalityCtor.captureTimeoutMs *
                TIMEOUT_MULTIPLIER[this.#difficulty] *
                this.#adaptive.timeoutScaleFor(step.modalityId),
            ),
          );
        } finally {
          unlink();
          this.#stepController = this.#controllers.abortAndRelease(stepController);
        }

        if (phase.signal.aborted || outcome.kind === 'aborted') return 'interrupted';

        if (outcome.kind === 'timeout') {
          this.#failReason = 'timeout';
          return 'fail';
        }

        this.#setState('SCORING');
        const score = instance.scoreStep(outcome.result, step.value);
        if (score.pass) {
          this.#combo += 1;
          if (this.#combo > this.#bestCombo) this.#bestCombo = this.#combo;
        } else {
          this.#combo = 0;
        }
        this.events.emit('score', {
          index,
          total,
          modalityId: step.modalityId,
          pass: score.pass,
          accuracy: score.accuracy,
          combo: this.#combo,
        });

        // 0 lives: the first wrong step ends the run immediately (CANON §6).
        if (!score.pass) {
          this.#failReason = 'wrong-step';
          return 'fail';
        }
        this.#setState('CAPTURING');
      }
      return 'clear';
    } catch (error) {
      if (isAbortError(error)) return 'interrupted';
      throw error;
    } finally {
      this.#phaseController = this.#controllers.abortAndRelease(phase);
    }
  }

  /** A cancellable pause that is still rAF-driven and still abort-owned. */
  async #hold(ms: number): Promise<void> {
    const controller = this.#controllers.create();
    try {
      await wait(this.#clock, ms, controller.signal);
    } catch (error) {
      if (!isAbortError(error)) throw error;
    } finally {
      this.#controllers.abortAndRelease(controller);
    }
  }

  #awaitResume(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.#resumeResolver = () => {
        this.#resumeResolver = null;
        resolve();
      };
    });
  }

  // --- modality activation ------------------------------------------------

  #activate(id: string): void {
    if (this.#activeId === id) return;
    if (this.#activeId) this.#instances.get(this.#activeId)?.deactivate();
    const signal = this.#levelController?.signal ?? AbortSignal.abort();
    this.#instances.get(id)!.activate(signal);
    this.#activeId = id;
  }

  #deactivateAll(): void {
    for (const instance of this.#instances.values()) instance.deactivate();
    this.#activeId = null;
  }

  // --- interruption -------------------------------------------------------

  readonly #onVisibilityChange = (): void => {
    if (!this.#visibility) return;

    if (this.#visibility.hidden) {
      if (this.#state !== 'PRESENTING' && this.#state !== 'CAPTURING') return;
      // CANON §7 / decisions/0005: the quota is checked here and consumed on
      // resume, so the second backgrounding ends the run as it happens.
      this.#interrupt = this.#replaysRemaining > 0 ? 'pause' : 'fail';
      this.#abortPhase();
      return;
    }

    if (this.#state === 'PAUSED') this.#resumeResolver?.();
  };

  #abortPhase(): void {
    this.#stepController = this.#controllers.abortAndRelease(this.#stepController);
    this.#phaseController = this.#controllers.abortAndRelease(this.#phaseController);
  }

  #enterFail(): void {
    this.#alive = false;
    this.#deactivateAll();
    this.#controllers.abortAll();
    this.#levelController = null;
    this.#phaseController = null;
    this.#stepController = null;
    this.#setState('FAIL');
    this.events.emit('fail', { reason: this.#failReason, level: this.#level, seed: this.#seed });
  }

  // --- emission -----------------------------------------------------------

  #setState(next: EngineState): void {
    if (this.#state === next) return;
    const previous = this.#state;
    this.#state = next;
    this.events.emit('state', { state: next, previous });
  }

  #emitQuota(): void {
    this.events.emit('quota', {
      replays: this.#replaysRemaining,
      retries: this.#retriesRemaining,
    });
  }

  #emitLevel(): void {
    const plan = this.#plan?.steps ?? [];
    this.events.emit('level', {
      level: this.#level,
      steps: this.#sequence.length,
      seed: this.#seed,
      plan,
      scheduled: this.#plan?.scheduled ?? null,
      substituted: this.#plan?.substituted ?? false,
      mode: this.#mode,
      assisted: [...new Set(plan)].filter((id) => this.#adaptive.assisted.includes(id)),
    });
  }
}

/**
 * Race the modality's capture against the engine's timeout. Both branches
 * handle their own rejection, so aborting the loser never surfaces as an
 * unhandled rejection.
 */
async function raceCapture(
  instance: Modality,
  signal: AbortSignal,
  clock: Clock,
  timeoutMs: number,
): Promise<CaptureOutcome> {
  const capture = instance.captureStep(signal).then(
    (result): CaptureOutcome => ({ kind: 'input', result }),
    (error: unknown): CaptureOutcome => {
      if (isAbortError(error)) return { kind: 'aborted' };
      throw error;
    },
  );

  const timer = wait(clock, timeoutMs, signal).then(
    (): CaptureOutcome => ({ kind: 'timeout' }),
    (): CaptureOutcome => ({ kind: 'aborted' }),
  );

  return Promise.race([capture, timer]);
}
