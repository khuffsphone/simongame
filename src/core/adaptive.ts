import type { ModalityRecord } from './persistence';

// Adaptive assist — CANON §4b.
//
// `modalityAccuracy` has been written on every scored step since the first
// build and read by nothing. This is the read.
//
// What adaptation is allowed to move, and what it is not, is the whole design:
//
//   moves   presentation duration, capture timeout
//   never   step count, cognitive budget, the curriculum ladder, RNG draws,
//           scoring thresholds, pass/fail
//
// The reason is falsifiability. If assist changed how many steps a level had,
// two players at "level 12" would have played different games and the number
// would mean nothing. If it changed the pass threshold, a trace that missed
// would be recorded as a trace that hit. Moving only *time* means the task is
// identical and the player is given room to do it — the same lever the
// difficulty setting already pulls, aimed at the one modality that needs it.

export interface AdaptiveProfile {
  /** True when at least one modality is currently scaled away from 1.0. */
  readonly active: boolean;
  /** Modalities being given extra time. Shown to the player — never hidden. */
  readonly assisted: readonly string[];
  presentScaleFor(modalityId: string): number;
  timeoutScaleFor(modalityId: string): number;
}

/** Attempts a modality needs before its record is allowed to move anything. */
export const MIN_ATTEMPTS = 8;
/** Below this pass rate the player is struggling and gets time. */
export const STRUGGLING_BELOW = 0.6;
/** Above this pass rate the modality is solved and can tighten. */
export const COMFORTABLE_ABOVE = 0.9;
/** The most time a struggling modality can be given. */
export const MAX_ASSIST = 1.35;
/** The least time a solved modality can be cut to. Never below the floor. */
export const MAX_PRESSURE = 0.9;

/**
 * Modes whose ruleset is fixed, so that two players' results are comparable.
 * Adaptivity is refused for these outright rather than merely defaulted off.
 *
 * `daily` is a forward declaration: the Daily Challenge does not exist yet, and
 * the gate is here now so it cannot ship without one.
 */
export const FIXED_RULESET_MODES: ReadonlySet<string> = new Set(['daily']);

export function adaptivityAllowed(mode: string): boolean {
  return !FIXED_RULESET_MODES.has(mode);
}

/** The do-nothing profile. Every scale is exactly 1 and `active` is false. */
export const INERT_ADAPTIVE: AdaptiveProfile = {
  active: false,
  assisted: [],
  presentScaleFor: () => 1,
  timeoutScaleFor: () => 1,
};

/**
 * Scale for one record's pass rate, piecewise linear and continuous at both
 * knees: 1.35 at a 0% pass rate, 1.0 from 60% to 90%, 0.9 at 100%.
 */
export function scaleForRecord(record: ModalityRecord | undefined): number {
  if (!record || record.attempts < MIN_ATTEMPTS) return 1;
  const rate = record.passes / record.attempts;

  if (rate < STRUGGLING_BELOW) {
    const t = (STRUGGLING_BELOW - rate) / STRUGGLING_BELOW;
    return 1 + t * (MAX_ASSIST - 1);
  }
  if (rate > COMFORTABLE_ABOVE) {
    const t = (rate - COMFORTABLE_ABOVE) / (1 - COMFORTABLE_ABOVE);
    return 1 - t * (1 - MAX_PRESSURE);
  }
  return 1;
}

export interface AdaptiveOptions {
  /** Refuse to adapt at all. Fixed rulesets pass false. */
  readonly enabled?: boolean;
}

export function createAdaptiveProfile(
  records: Readonly<Record<string, ModalityRecord>>,
  options: AdaptiveOptions = {},
): AdaptiveProfile {
  if (options.enabled === false) return INERT_ADAPTIVE;

  const scales = new Map<string, number>();
  for (const [id, record] of Object.entries(records)) {
    const scale = scaleForRecord(record);
    if (scale !== 1) scales.set(id, scale);
  }
  if (scales.size === 0) return INERT_ADAPTIVE;

  const assisted = [...scales].filter(([, scale]) => scale > 1).map(([id]) => id);

  return {
    active: true,
    assisted,
    presentScaleFor: (id) => scales.get(id) ?? 1,
    // Pressure is never applied to the answer clock. Taking time *away* from a
    // player who is answering correctly is a punishment for competence; the
    // shorter demonstration is enough.
    timeoutScaleFor: (id) => Math.max(1, scales.get(id) ?? 1),
  };
}
