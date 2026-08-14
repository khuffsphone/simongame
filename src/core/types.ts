import type { AudioService } from './audio';
import type { Clock } from './clock';
import type { Rng } from './rng';

/** Result of one captured step. `meta` carries modality-specific detail. */
export interface CaptureResult<V = unknown> {
  readonly value: V;
  readonly meta: Readonly<Record<string, unknown>>;
}

/** Result of scoring one step. `accuracy` is in [0, 1]. */
export interface StepScore {
  readonly pass: boolean;
  readonly accuracy: number;
}

/** Injected into every modality at mount. No modality reaches for globals. */
export interface ModalityServices {
  readonly audio: AudioService;
  readonly clock: Clock;
  readonly reducedMotion: boolean;
}

/**
 * The instance side of the modality contract (CANON §3).
 *
 * Every async method takes an AbortSignal and rejects with a DOMException named
 * `AbortError` when it fires. `captureStep` never resolves on its own timer —
 * the engine owns the capture timeout.
 */
export interface Modality<V = unknown, C = V> {
  mount(container: HTMLElement, services: ModalityServices): void;
  unmount(): void;
  activate(signal: AbortSignal): void;
  deactivate(): void;
  presentStep(value: V, durationMs: number, signal: AbortSignal): Promise<void>;
  captureStep(signal: AbortSignal): Promise<CaptureResult<C>>;
  scoreStep(input: CaptureResult<C>, expected: V): StepScore;
}

/**
 * The static side of the modality contract. Cardinality lives here, in the
 * modality — the engine never knows how many options a modality has.
 */
export interface ModalityClass<V = unknown, C = V> {
  new (): Modality<V, C>;
  readonly id: string;
  readonly label: string;
  /** One-line description shown on the mode-select card. */
  readonly blurb: string;
  readonly minPresentMs: number;
  readonly captureTimeoutMs: number;
  generateValue(rng: Rng, level: number): V;
}

/** A modality class with its type parameters erased, as the engine stores them. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyModalityClass = ModalityClass<any, any>;
