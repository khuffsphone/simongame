import type { Rng } from '../core/rng';
import { DiscreteGridModality, type DiscreteOption } from './discrete-grid';
import './color.css';

// Colour pads — the level 1 modality (CANON §4).

const PADS = [
  { label: 'green pad', toneHz: 329.63 },
  { label: 'red pad', toneHz: 392.0 },
  { label: 'yellow pad', toneHz: 440.0 },
  { label: 'blue pad', toneHz: 523.25 },
] as const;

export class ColorModality extends DiscreteGridModality {
  static readonly id = 'color';
  static readonly label = 'Colour';
  static readonly blurb = 'Four pads. The original.';
  static override readonly answerLabels = ['Green', 'Red', 'Yellow', 'Blue'] as const;
  static readonly minPresentMs = 320;
  static readonly captureTimeoutMs = 3000;

  /** Cardinality lives in the modality, never in the engine. */
  static generateValue(rng: Rng, _level: number): number {
    return rng.nextInt(PADS.length);
  }

  protected override get gridClass(): string {
    return 'grid--color';
  }

  protected override buildOptions(): DiscreteOption[] {
    return PADS.map((pad, index) => ({
      value: index,
      label: pad.label,
      toneHz: pad.toneHz,
      decorate: (button: HTMLButtonElement) => {
        button.dataset['color'] = String(index);
      },
    }));
  }
}
