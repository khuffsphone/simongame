import type { Rng } from '../core/rng';
import { DiscreteGridModality, type DiscreteOption } from './discrete-grid';
import './number.css';

// Number tiles — the level 2 modality (CANON §4).

const DIGITS = [
  { digit: '1', toneHz: 261.63 },
  { digit: '2', toneHz: 311.13 },
  { digit: '3', toneHz: 349.23 },
  { digit: '4', toneHz: 415.3 },
] as const;

export class NumberModality extends DiscreteGridModality {
  static readonly id = 'number';
  static readonly label = 'Number';
  /** Longer than colour: reading a glyph is slower than identifying a hue. */
  static readonly minPresentMs = 400;
  static readonly captureTimeoutMs = 3000;

  static generateValue(rng: Rng, _level: number): number {
    return rng.nextInt(DIGITS.length);
  }

  protected override get toneType(): OscillatorType {
    return 'triangle';
  }

  protected override get gridClass(): string {
    return 'grid--number';
  }

  protected override buildOptions(): DiscreteOption[] {
    return DIGITS.map((entry, index) => ({
      value: index,
      label: `number ${entry.digit}`,
      toneHz: entry.toneHz,
      decorate: (button: HTMLButtonElement) => {
        const glyph = document.createElement('span');
        glyph.className = 'grid__digit';
        glyph.textContent = entry.digit;
        button.append(glyph);
      },
    }));
  }
}
