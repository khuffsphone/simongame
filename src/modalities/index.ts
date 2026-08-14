import { ModalityRegistry } from '../core/registry';
import { ColorModality } from './color';
import { NumberModality } from './number';
import { RhythmModality } from './rhythm';
import { ShapeModality } from './shape';
import { SoundModality } from './sound';
import { TraceModality } from './trace';

/**
 * The plugin boundary (CANON §3). A modality costs one file and one line here —
 * and nothing in `src/core/`.
 *
 * Rhythm was added under exactly that rule: `rhythm.ts` plus the line below.
 * Registration order is menu order and mixed-mode order.
 */
export function createDefaultRegistry(): ModalityRegistry {
  return new ModalityRegistry()
    .register(ColorModality)
    .register(NumberModality)
    .register(ShapeModality)
    .register(SoundModality)
    .register(TraceModality)
    .register(RhythmModality);
}

export {
  ColorModality,
  NumberModality,
  RhythmModality,
  ShapeModality,
  SoundModality,
  TraceModality,
};
