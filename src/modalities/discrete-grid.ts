import { abortError, throwIfAborted, waitVisible } from '../core/clock';
import type { CaptureResult, Modality, ModalityServices, StepScore } from '../core/types';
import './discrete-grid.css';

/**
 * Shared implementation for discrete four-option modalities (CANON §4: colour,
 * number, shape, and sound each expose 4 options).
 *
 * This is a modality-side helper, not an engine file — a new discrete modality
 * still costs exactly one new file plus one registry entry.
 */

export interface DiscreteOption {
  /** The value the engine generates and scores. Index into the option list. */
  readonly value: number;
  /** Accessible name for the option. */
  readonly label: string;
  /** Presentation tone, in Hz. */
  readonly toneHz: number;
  /** Fill in the option's visual content. Owns everything inside `button`. */
  decorate(button: HTMLButtonElement): void;
}

/** Presentation tones stay short even when a slow level presents for longer. */
const MAX_TONE_MS = 420;
const TAP_TONE_MS = 90;

export abstract class DiscreteGridModality implements Modality<number> {
  protected services: ModalityServices | null = null;

  #root: HTMLElement | null = null;
  #buttons: HTMLButtonElement[] = [];
  #options: DiscreteOption[] = [];

  /** The option set. Called once, at mount. Cardinality lives here. */
  protected abstract buildOptions(): DiscreteOption[];

  /** Waveform used for this modality's presentation tones. */
  protected get toneType(): OscillatorType {
    return 'sine';
  }

  /** Class name applied to the grid, so each modality can style its own pads. */
  protected abstract get gridClass(): string;

  /**
   * Whether presentation lights the specific pad. The sound modality sets this
   * false: if the pad lit up, identifying the tone would be unnecessary and the
   * modality would collapse into a colour game.
   */
  protected get revealsPadDuringPresentation(): boolean {
    return true;
  }

  mount(container: HTMLElement, services: ModalityServices): void {
    this.services = services;
    this.#options = this.buildOptions();

    const root = document.createElement('div');
    root.className = `grid ${this.gridClass}`;
    root.dataset['active'] = 'false';
    root.dataset['armed'] = 'false';

    this.#buttons = this.#options.map((option) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'grid__pad';
      button.dataset['value'] = String(option.value);
      button.dataset['presenting'] = 'false';
      button.setAttribute('aria-label', option.label);
      option.decorate(button);
      root.append(button);
      return button;
    });

    container.append(root);
    this.#root = root;
  }

  unmount(): void {
    this.#root?.remove();
    this.#root = null;
    this.#buttons = [];
    this.#options = [];
    this.services = null;
  }

  activate(signal: AbortSignal): void {
    if (!this.#root) return;
    this.#root.dataset['active'] = 'true';
    // The engine hands us the level signal; when the level ends we hide again.
    signal.addEventListener('abort', () => this.deactivate(), { once: true });
  }

  deactivate(): void {
    if (!this.#root) return;
    this.#root.dataset['active'] = 'false';
    this.#root.dataset['armed'] = 'false';
    delete this.#root.dataset['stepValue'];
    for (const button of this.#buttons) button.dataset['presenting'] = 'false';
  }

  async presentStep(value: number, durationMs: number, signal: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    const button = this.#buttons[value];
    const option = this.#options[value];
    const root = this.#root;
    if (!button || !option || !root || !this.services) {
      throw new Error(`Cannot present unknown option ${value}`);
    }

    // Every modality marks presentation on its root, which is the one hook the
    // e2e suite observes across all six (decisions/0007).
    root.dataset['stepValue'] = String(value);
    if (this.revealsPadDuringPresentation) {
      button.dataset['presenting'] = 'true';
    } else {
      root.dataset['listening'] = 'true';
    }
    this.services.audio.tone({
      freq: option.toneHz,
      durationMs: Math.min(durationMs, MAX_TONE_MS),
      type: this.toneType,
    });

    try {
      // waitVisible, not wait: a flash the player never saw cannot be
      // reproduced, so the cue must survive a stalled frame (CANON §10).
      await waitVisible(this.services.clock, durationMs, signal);
    } finally {
      button.dataset['presenting'] = 'false';
      delete root.dataset['listening'];
      delete root.dataset['stepValue'];
    }
  }

  captureStep(signal: AbortSignal): Promise<CaptureResult<number>> {
    return new Promise<CaptureResult<number>>((resolve, reject) => {
      const root = this.#root;
      if (!root) {
        reject(new Error('captureStep called before mount'));
        return;
      }
      if (signal.aborted) {
        reject(abortError());
        return;
      }

      root.dataset['armed'] = 'true';
      const disarm = (): void => {
        root.dataset['armed'] = 'false';
      };

      // Listeners are bound to the engine's step signal, so aborting the step
      // removes every one of them. The modality creates no controller of its own.
      this.#buttons.forEach((button, index) => {
        button.addEventListener(
          'pointerdown',
          (event: PointerEvent) => {
            // Pointer Events only, committing on pointerdown (CANON §8).
            event.preventDefault();
            disarm();
            this.services?.audio.tone({
              freq: this.#options[index]!.toneHz,
              durationMs: TAP_TONE_MS,
              type: this.toneType,
            });
            resolve({
              value: index,
              meta: { pointerType: event.pointerType, isPrimary: event.isPrimary },
            });
          },
          { signal },
        );
      });

      signal.addEventListener(
        'abort',
        () => {
          disarm();
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
}
