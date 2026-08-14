import { abortError, wait } from '../../src/core/clock';
import type { Rng } from '../../src/core/rng';
import type { CaptureResult, Modality, ModalityServices, StepScore } from '../../src/core/types';

/**
 * A modality the test drives directly, so engine-FSM tests exercise the engine
 * rather than DOM plumbing. It honours the real contract: presentation waits on
 * the injected clock, and capture resolves only when the test supplies input or
 * the engine aborts it.
 */
export class ScriptedModality implements Modality<number> {
  static readonly id = 'scripted';
  static readonly label = 'Scripted';
  static readonly blurb = 'Test double.';
  static readonly minPresentMs = 10;
  static readonly captureTimeoutMs = 1000;
  static readonly cardinality = 4;

  static instances: ScriptedModality[] = [];

  static reset(): void {
    ScriptedModality.instances = [];
  }

  static generateValue(rng: Rng, _level: number): number {
    return rng.nextInt(ScriptedModality.cardinality);
  }

  /** Every value ever presented, in order, across levels and replays. */
  readonly presented: number[] = [];
  mounted = false;
  active = false;

  #services: ModalityServices | null = null;
  #resolve: ((result: CaptureResult<number>) => void) | null = null;

  constructor() {
    ScriptedModality.instances.push(this);
  }

  mount(container: HTMLElement, services: ModalityServices): void {
    this.#services = services;
    this.mounted = true;
    container.dataset['scripted'] = 'true';
  }

  unmount(): void {
    this.mounted = false;
  }

  activate(): void {
    this.active = true;
  }

  deactivate(): void {
    this.active = false;
  }

  async presentStep(value: number, durationMs: number, signal: AbortSignal): Promise<void> {
    this.presented.push(value);
    await wait(this.#services!.clock, durationMs, signal);
  }

  captureStep(signal: AbortSignal): Promise<CaptureResult<number>> {
    return new Promise<CaptureResult<number>>((resolve, reject) => {
      if (signal.aborted) {
        reject(abortError());
        return;
      }
      this.#resolve = resolve;
      signal.addEventListener(
        'abort',
        () => {
          this.#resolve = null;
          reject(abortError());
        },
        { once: true },
      );
    });
  }

  scoreStep(input: CaptureResult<number>, expected: number): StepScore {
    const pass = input.value === expected;
    return { pass, accuracy: pass ? 1 : 0 };
  }

  /** Deliver a player input. Returns false if no capture is currently open. */
  push(value: number): boolean {
    const resolve = this.#resolve;
    if (!resolve) return false;
    this.#resolve = null;
    resolve({ value, meta: { source: 'scripted' } });
    return true;
  }

  get awaitingInput(): boolean {
    return this.#resolve !== null;
  }
}
