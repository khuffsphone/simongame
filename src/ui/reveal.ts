import type { EngineEvents, FailReason } from '../core/engine';
import type { ModalityRegistry } from '../core/registry';

// The failure reveal — CANON §6, decisions/0020.
//
// A memory game that ends with "Wrong step." and nothing else tells the player
// the one thing they already knew and withholds the only thing they wanted. The
// answer is not a hint or a spoiler: the run is over, the sequence is spent, and
// the next run generates a different one. There is nothing left to protect.
//
// Pure and DOM-free, so every wording is unit-testable without a browser.

export interface RevealCopy {
  /** Headline. Never a taunt, never an exclamation. */
  readonly title: string;
  /** One or two short sentences. Answer first, then what the player did. */
  readonly body: string;
}

const HOW_YOU_LOST: Record<FailReason, string> = {
  'wrong-step': 'Wrong step.',
  timeout: 'Out of time.',
  'focus-lost': 'You left the game twice.',
};

/** Guards a modality's own formatter: a throw here must not eat the overlay. */
function safely(describe: () => string): string | null {
  try {
    const text = describe();
    return typeof text === 'string' && text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

export function describeFailure(
  registry: ModalityRegistry,
  fail: EngineEvents['fail'],
): RevealCopy {
  const parts: string[] = [HOW_YOU_LOST[fail.reason]];
  const step = fail.expected;
  const ModalityCtor = step ? registry.get(step.modalityId) : undefined;

  if (step && ModalityCtor) {
    const answer = safely(() => ModalityCtor.describeValue(step.value));
    if (answer) parts.push(`The answer was ${answer}.`);

    if (fail.reason === 'wrong-step' && fail.received !== null) {
      const got = safely(() => ModalityCtor.describeCapture(fail.received));
      // Only worth saying when it differs from the answer. On a modality scored
      // by shape rather than identity — trace, rhythm — the two descriptions can
      // legitimately match a failing attempt, and "You drew a V. You drew a V."
      // reads as a bug.
      if (got && got !== answer) parts.push(`You gave ${got}.`);
    }
  }

  parts.push(`You reached level ${fail.level}.`);
  return { title: 'RUN OVER', body: parts.join(' ') };
}
