import type { Rng } from '../core/rng';
import { DiscreteGridModality, type DiscreteOption } from './discrete-grid';
import './sound.css';

// Tone pads — the level 4 modality.
//
// Presentation deliberately does NOT light the pad: the cue is the pitch. If
// the pad lit up this would be a colour game with extra steps. The grid shows a
// neutral "listening" pulse instead, so the player knows a step is playing
// without being told which one.

const TONES = [
  { label: 'low tone', toneHz: 196.0, note: 'G3' },
  { label: 'mid-low tone', toneHz: 261.63, note: 'C4' },
  { label: 'mid-high tone', toneHz: 349.23, note: 'F4' },
  { label: 'high tone', toneHz: 523.25, note: 'C5' },
] as const;

export class SoundModality extends DiscreteGridModality {
  static readonly id = 'sound';
  static readonly label = 'Sound';
  static readonly blurb = 'Pitch only. No pad lights up.';
  /** Longer than the visual modalities: a pitch needs time to be identified. */
  static readonly minPresentMs = 520;
  static readonly captureTimeoutMs = 4000;

  static generateValue(rng: Rng, _level: number): number {
    return rng.nextInt(TONES.length);
  }

  protected override get toneType(): OscillatorType {
    return 'sine';
  }

  protected override get revealsPadDuringPresentation(): boolean {
    return false;
  }

  protected override get gridClass(): string {
    return 'grid--sound';
  }

  protected override buildOptions(): DiscreteOption[] {
    return TONES.map((tone, index) => ({
      value: index,
      label: tone.label,
      toneHz: tone.toneHz,
      decorate: (button: HTMLButtonElement) => {
        const bars = document.createElement('span');
        bars.className = 'grid__bars';
        // Height ramp doubles as a colour-independent cue for which pad is which.
        for (let i = 0; i < 4; i += 1) {
          const bar = document.createElement('i');
          bar.style.setProperty('--h', `${28 + index * 16 + i * 6}%`);
          bars.append(bar);
        }
        const note = document.createElement('em');
        note.className = 'grid__note';
        note.textContent = tone.note;
        button.append(bars, note);
      },
    }));
  }
}
