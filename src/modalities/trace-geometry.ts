// Trace scoring — CANON §12, decisions/0006. Pure and DOM-free so it is
// unit-testable, including both sides of the 0.85 pass boundary.

export interface Point {
  readonly x: number;
  readonly y: number;
}

export const RESAMPLE_N = 32;
/** Mean per-point deviation, in units of the glyph's own RMS radius. */
export const D_MAX = 1;
export const PASS_THRESHOLD = 0.85;

/** A stroke shorter than this is a stray tap, not an attempt. */
export const MIN_SAMPLES = 8;
export const MIN_ARC_LENGTH_PX = 24;
export const MIN_SAMPLE_SPACING_PX = 2;

/** Unit-box glyphs. Direction is significant: a reversed trace is a fail. */
export const TRACE_TEMPLATES: Record<string, readonly Point[]> = {
  line: [
    { x: 0.1, y: 0.5 },
    { x: 0.9, y: 0.5 },
  ],
  vee: [
    { x: 0.14, y: 0.24 },
    { x: 0.5, y: 0.8 },
    { x: 0.86, y: 0.24 },
  ],
  ell: [
    { x: 0.24, y: 0.16 },
    { x: 0.24, y: 0.8 },
    { x: 0.84, y: 0.8 },
  ],
  arc: Array.from({ length: 13 }, (_, i) => {
    const t = Math.PI * (i / 12);
    return { x: 0.5 + 0.38 * Math.sin(t), y: 0.5 - 0.38 * Math.cos(t) };
  }),
  zigzag: [
    { x: 0.12, y: 0.28 },
    { x: 0.38, y: 0.74 },
    { x: 0.62, y: 0.28 },
    { x: 0.88, y: 0.74 },
  ],
  wave: Array.from({ length: 17 }, (_, i) => {
    const t = i / 16;
    return { x: 0.1 + 0.8 * t, y: 0.5 - 0.28 * Math.sin(t * Math.PI * 2) };
  }),
};

export const TRACE_GLYPHS = Object.keys(TRACE_TEMPLATES);

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function arcLength(points: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += distance(points[i - 1]!, points[i]!);
  return total;
}

/**
 * Resample to `n` points spaced equally by **arc length**, not by time — so a
 * slow careful trace and a fast confident one of the same shape score alike.
 */
export function resample(points: readonly Point[], n: number = RESAMPLE_N): Point[] {
  if (points.length === 0) return Array.from({ length: n }, () => ({ x: 0, y: 0 }));
  if (points.length === 1) return Array.from({ length: n }, () => points[0]!);

  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i += 1) {
    cumulative[i] = cumulative[i - 1]! + distance(points[i - 1]!, points[i]!);
  }
  const total = cumulative[cumulative.length - 1]!;
  if (total === 0) return Array.from({ length: n }, () => points[0]!);

  const out: Point[] = [];
  let cursor = 1;
  for (let i = 0; i < n; i += 1) {
    const target = (total * i) / (n - 1);
    while (cursor < cumulative.length - 1 && cumulative[cursor]! < target) cursor += 1;
    const prev = cursor - 1;
    const span = cumulative[cursor]! - cumulative[prev]!;
    const t = span === 0 ? 0 : (target - cumulative[prev]!) / span;
    out.push({
      x: lerp(points[prev]!.x, points[cursor]!.x, t),
      y: lerp(points[prev]!.y, points[cursor]!.y, t),
    });
  }
  return out;
}

/**
 * Translate the centroid to the origin and scale so the RMS distance from it is
 * 1. RMS rather than bounding box: a bounding box is defined by its two extreme
 * points, so one overshoot rescales the whole glyph and drags every other point
 * off its template position.
 */
export function normalize(points: readonly Point[]): Point[] {
  if (points.length === 0) return [];
  let cx = 0;
  let cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  cx /= points.length;
  cy /= points.length;

  let sumSquares = 0;
  for (const p of points) sumSquares += (p.x - cx) ** 2 + (p.y - cy) ** 2;
  const rms = Math.sqrt(sumSquares / points.length);
  const scale = rms === 0 ? 1 : 1 / rms;

  return points.map((p) => ({ x: (p.x - cx) * scale, y: (p.y - cy) * scale }));
}

export interface TraceScore {
  pass: boolean;
  accuracy: number;
  meanDistance: number;
  rejected: boolean;
}

/**
 * Score a candidate stroke against a template.
 *
 * Index-aligned mean Euclidean distance, not DTW: after arc-length resampling
 * the correspondence is already meaningful, and DTW would warp the candidate to
 * fit — forgiving exactly the proportion errors the player is meant to be
 * reproducing.
 */
export function scoreTrace(candidate: readonly Point[], template: readonly Point[]): TraceScore {
  if (candidate.length < MIN_SAMPLES || arcLength(candidate) < MIN_ARC_LENGTH_PX) {
    return { pass: false, accuracy: 0, meanDistance: Infinity, rejected: true };
  }

  const a = normalize(resample(candidate));
  const b = normalize(resample(template));

  let total = 0;
  for (let i = 0; i < a.length; i += 1) total += distance(a[i]!, b[i]!);
  const meanDistance = total / a.length;

  const accuracy = Math.min(1, Math.max(0, 1 - meanDistance / D_MAX));
  return { pass: accuracy >= PASS_THRESHOLD, accuracy, meanDistance, rejected: false };
}

/** SVG `points` attribute for a unit-box polyline scaled to a 0-100 viewBox. */
export function toSvgPoints(points: readonly Point[]): string {
  return points.map((p) => `${(p.x * 100).toFixed(2)},${(p.y * 100).toFixed(2)}`).join(' ');
}
