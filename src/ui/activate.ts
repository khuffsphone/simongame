/**
 * Activation for UI chrome.
 *
 * decisions/0010 established that chrome must not be bound to `pointerdown`
 * alone — keyboard, assistive tech, and synthetic clicks produce no pointer
 * event and the control becomes a silent no-op.
 *
 * decisions/0015 then established that it must not be bound to `pointerdown`
 * *at all* when the handler replaces the DOM: the `click` that follows a real
 * tap is dispatched at the same screen coordinates, lands on whatever now
 * occupies them, and activates it. One tap crossed two screens.
 *
 * So navigation is bound to `click` only, which every input path produces.
 * Audio priming — which changes nothing on screen — is bound separately to
 * `pointerdown`, so iOS still gets the earliest possible gesture to unlock on.
 */

export function onActivate(element: HTMLElement, handler: () => void): () => void {
  const onClick = (): void => handler();
  element.addEventListener('click', onClick);
  return () => element.removeEventListener('click', onClick);
}

/**
 * Run `prime` on pointerdown. Must be side-effect-free as far as the DOM is
 * concerned — it exists so `AudioContext.resume()` happens at the very start of
 * a tap rather than at its end.
 */
export function onPrime(element: HTMLElement, prime: () => void): () => void {
  const onPointerDown = (): void => prime();
  element.addEventListener('pointerdown', onPointerDown);
  return () => element.removeEventListener('pointerdown', onPointerDown);
}

/**
 * Guard for controls that appear underneath a pointer that is already down —
 * the fail overlay opens during a pad tap, and that tap's trailing `click`
 * would otherwise hit whichever overlay button landed under the finger.
 */
export function justAppearedGuard(windowMs = 400): {
  arm: () => void;
  blocked: () => boolean;
} {
  let armedAt = -Infinity;
  return {
    arm: () => {
      armedAt = performance.now();
    },
    blocked: () => performance.now() - armedAt < windowMs,
  };
}
