import type { Rng } from '../core/rng';
import { DiscreteGridModality, type DiscreteOption } from './discrete-grid';
import './shape.css';

// Shape pads — the level 3 modality. Inline SVG, no external assets.

const SHAPES = [
  {
    label: 'circle',
    toneHz: 246.94,
    path: '<circle cx="50" cy="50" r="34" />',
  },
  {
    label: 'square',
    toneHz: 311.13,
    path: '<rect x="18" y="18" width="64" height="64" rx="8" />',
  },
  {
    label: 'triangle',
    toneHz: 369.99,
    path: '<polygon points="50,14 86,82 14,82" />',
  },
  {
    label: 'star',
    toneHz: 493.88,
    path: '<polygon points="50,10 61,38 92,38 67,57 76,87 50,69 24,87 33,57 8,38 39,38" />',
  },
] as const;

export class ShapeModality extends DiscreteGridModality {
  static readonly id = 'shape';
  static readonly label = 'Shape';
  static readonly blurb = 'Silhouettes at speed.';
  static readonly minPresentMs = 380;
  static readonly captureTimeoutMs = 3000;

  static generateValue(rng: Rng, _level: number): number {
    return rng.nextInt(SHAPES.length);
  }

  protected override get gridClass(): string {
    return 'grid--shape';
  }

  protected override buildOptions(): DiscreteOption[] {
    return SHAPES.map((shape, index) => ({
      value: index,
      label: shape.label,
      toneHz: shape.toneHz,
      decorate: (button: HTMLButtonElement) => {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 100 100');
        svg.setAttribute('class', 'grid__glyph');
        svg.setAttribute('aria-hidden', 'true');
        svg.innerHTML = shape.path;
        button.append(svg);
      },
    }));
  }
}
