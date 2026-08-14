import { ModalityRegistry } from '../core/registry';
import { ColorModality } from './color';
import { NumberModality } from './number';

/**
 * The plugin boundary (CANON §3). A new modality costs one new file and one
 * line here — and nothing in `src/core/`. Phase C proves that by adding one.
 *
 * Registration order is HUD order. Levels 3-5 name shape, sound, and trace;
 * until those exist the schedule substitutes from what is registered
 * (decisions/0004).
 */
export function createDefaultRegistry(): ModalityRegistry {
  return new ModalityRegistry().register(ColorModality).register(NumberModality);
}

export { ColorModality, NumberModality };
