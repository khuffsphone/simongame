type Listener<T> = (payload: T) => void;

/** Minimal typed event emitter. The engine's only channel to the UI. */
export class Emitter<Events extends Record<string, unknown>> {
  readonly #listeners = new Map<keyof Events, Set<Listener<never>>>();

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let set = this.#listeners.get(event);
    if (!set) {
      set = new Set();
      this.#listeners.set(event, set);
    }
    set.add(listener as Listener<never>);
    return () => {
      set.delete(listener as Listener<never>);
    };
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.#listeners.get(event);
    if (!set) return;
    // Copied so a listener that unsubscribes during dispatch cannot skip a peer.
    for (const listener of [...set]) {
      try {
        (listener as Listener<Events[K]>)(payload);
      } catch (error) {
        // A throwing subscriber must not unwind into the engine's run loop:
        // there it would be caught as an engine error and end the run with a
        // stale fail reason. Report it and keep dispatching to the rest.
        console.error(`[modeshift] listener for "${String(event)}" threw`, error);
      }
    }
  }

  clear(): void {
    this.#listeners.clear();
  }
}
