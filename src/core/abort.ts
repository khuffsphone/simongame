// Controller ownership — CANON §10. One owner creates and nulls each
// controller. The registry exists so the leak test can assert that the live
// count returns to baseline after a run.

export class ControllerRegistry {
  readonly #live = new Set<AbortController>();
  #created = 0;

  create(): AbortController {
    const controller = new AbortController();
    this.#live.add(controller);
    this.#created += 1;
    return controller;
  }

  /** Abort and forget. Safe to call with an already-released controller. */
  abortAndRelease(controller: AbortController | null): null {
    if (!controller) return null;
    if (!controller.signal.aborted) controller.abort();
    this.#live.delete(controller);
    return null;
  }

  /** Forget without aborting — for a controller whose work completed normally. */
  release(controller: AbortController | null): null {
    if (!controller) return null;
    this.#live.delete(controller);
    return null;
  }

  abortAll(): void {
    for (const controller of [...this.#live]) this.abortAndRelease(controller);
  }

  /** Controllers created but not yet released. Must return to 0 between runs. */
  get liveCount(): number {
    return this.#live.size;
  }

  /** Monotonic total, so a test can prove controllers were actually created. */
  get createdCount(): number {
    return this.#created;
  }
}

/**
 * Abort `child` when `parent` aborts, without leaking the listener once the
 * child settles on its own. The returned function detaches the link.
 */
export function linkAbort(parent: AbortSignal, child: AbortController): () => void {
  if (parent.aborted) {
    if (!child.signal.aborted) child.abort();
    return () => {};
  }
  const onParentAbort = (): void => {
    if (!child.signal.aborted) child.abort();
  };
  parent.addEventListener('abort', onParentAbort, { once: true });
  return () => parent.removeEventListener('abort', onParentAbort);
}
