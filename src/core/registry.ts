import type { AnyModalityClass } from './types';

/**
 * The plugin boundary. Adding a modality means adding its file and one entry
 * here — no engine file changes. Phase C proves that by doing it.
 */
export class ModalityRegistry {
  readonly #byId = new Map<string, AnyModalityClass>();

  register(modality: AnyModalityClass): this {
    if (this.#byId.has(modality.id)) {
      throw new Error(`Modality id "${modality.id}" is already registered`);
    }
    this.#byId.set(modality.id, modality);
    return this;
  }

  get(id: string): AnyModalityClass | undefined {
    return this.#byId.get(id);
  }

  /** Throws rather than returning undefined, for engine paths that require one. */
  require(id: string): AnyModalityClass {
    const found = this.#byId.get(id);
    if (!found) throw new Error(`Modality "${id}" is not registered`);
    return found;
  }

  has(id: string): boolean {
    return this.#byId.has(id);
  }

  /** Registration order, which is also HUD order. */
  ids(): string[] {
    return [...this.#byId.keys()];
  }

  all(): AnyModalityClass[] {
    return [...this.#byId.values()];
  }

  get size(): number {
    return this.#byId.size;
  }
}
