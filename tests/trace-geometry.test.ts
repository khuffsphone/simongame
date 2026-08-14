import { describe, expect, it } from 'vitest';
import {
  MIN_ARC_LENGTH_PX,
  PASS_THRESHOLD,
  RESAMPLE_N,
  TRACE_GLYPHS,
  TRACE_TEMPLATES,
  arcLength,
  normalize,
  resample,
  scoreTrace,
  type Point,
} from '../src/modalities/trace-geometry';

// CANON §12 / decisions/0006.

const scaleTo = (points: readonly Point[], size: number, offset = 0): Point[] =>
  points.map((p) => ({ x: p.x * size + offset, y: p.y * size + offset }));

/** Rotate about the centroid — a deformation normalization does NOT undo. */
function rotate(points: readonly Point[], radians: number): Point[] {
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return points.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
  });
}

/** A dense stroke along a template, as a real pointer would produce. */
function strokeOf(glyph: string, size = 300): Point[] {
  return scaleTo(resample(TRACE_TEMPLATES[glyph]!, 64), size);
}

describe('resampling', () => {
  it('returns exactly N points, endpoints included', () => {
    const out = resample(TRACE_TEMPLATES['vee']!);
    expect(out).toHaveLength(RESAMPLE_N);
    expect(out[0]).toEqual(TRACE_TEMPLATES['vee']![0]);
    const last = TRACE_TEMPLATES['vee']![TRACE_TEMPLATES['vee']!.length - 1]!;
    expect(out[RESAMPLE_N - 1]!.x).toBeCloseTo(last.x, 6);
    expect(out[RESAMPLE_N - 1]!.y).toBeCloseTo(last.y, 6);
  });

  it('spaces points equally by arc length, not by input index', () => {
    // A polyline whose second leg is three times the first: an index-spaced
    // resample would put half the points on each leg.
    const line: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 4, y: 0 },
    ];
    const out = resample(line, 5);
    expect(out.map((p) => Number(p.x.toFixed(4)))).toEqual([0, 1, 2, 3, 4]);
  });

  it('survives degenerate input', () => {
    expect(resample([], 8)).toHaveLength(8);
    expect(resample([{ x: 0.5, y: 0.5 }], 8)).toHaveLength(8);
    const same = Array.from({ length: 5 }, () => ({ x: 2, y: 2 }));
    expect(resample(same, 8).every((p) => p.x === 2 && p.y === 2)).toBe(true);
  });
});

describe('normalization', () => {
  it('centres the centroid on the origin and sets RMS radius to 1', () => {
    const out = normalize(resample(TRACE_TEMPLATES['arc']!));
    const cx = out.reduce((s, p) => s + p.x, 0) / out.length;
    const cy = out.reduce((s, p) => s + p.y, 0) / out.length;
    expect(cx).toBeCloseTo(0, 10);
    expect(cy).toBeCloseTo(0, 10);
    const rms = Math.sqrt(out.reduce((s, p) => s + p.x ** 2 + p.y ** 2, 0) / out.length);
    expect(rms).toBeCloseTo(1, 10);
  });
});

describe('scoreTrace', () => {
  it.each(TRACE_GLYPHS)('scores a faithful %s trace as a pass', (glyph) => {
    const score = scoreTrace(strokeOf(glyph), TRACE_TEMPLATES[glyph]!);
    expect(score.rejected).toBe(false);
    expect(score.accuracy).toBeGreaterThan(0.99);
    expect(score.pass).toBe(true);
  });

  it('is invariant to where on screen the stroke was drawn and how big', () => {
    const template = TRACE_TEMPLATES['vee']!;
    const small = scaleTo(resample(template, 64), 90, 5);
    const large = scaleTo(resample(template, 64), 700, 260);
    expect(scoreTrace(small, template).accuracy).toBeCloseTo(
      scoreTrace(large, template).accuracy,
      6,
    );
    expect(scoreTrace(large, template).pass).toBe(true);
  });

  it('fails a glyph traced backwards, because direction is significant', () => {
    const reversed = [...strokeOf('ell')].reverse();
    const score = scoreTrace(reversed, TRACE_TEMPLATES['ell']!);
    expect(score.pass).toBe(false);
  });

  it('fails a different glyph', () => {
    expect(scoreTrace(strokeOf('vee'), TRACE_TEMPLATES['line']!).pass).toBe(false);
    expect(scoreTrace(strokeOf('zigzag'), TRACE_TEMPLATES['arc']!).pass).toBe(false);
  });

  it('rejects a stray tap rather than scoring it', () => {
    const tap: Point[] = [
      { x: 10, y: 10 },
      { x: 11, y: 10 },
    ];
    const score = scoreTrace(tap, TRACE_TEMPLATES['line']!);
    expect(score.rejected).toBe(true);
    expect(score.pass).toBe(false);
    expect(score.accuracy).toBe(0);
  });

  it('rejects a stroke shorter than the minimum arc length', () => {
    const tiny = scaleTo(resample(TRACE_TEMPLATES['line']!, 16), MIN_ARC_LENGTH_PX / 4);
    expect(arcLength(tiny)).toBeLessThan(MIN_ARC_LENGTH_PX);
    expect(scoreTrace(tiny, TRACE_TEMPLATES['line']!).rejected).toBe(true);
  });

  // The 0.85 boundary, approached from both sides. Rotation is used because it
  // is the one deformation the normalize step does not undo, so the deviation
  // is controllable and monotonic in the angle.
  describe('the 0.85 pass boundary', () => {
    const template = TRACE_TEMPLATES['zigzag']!;
    const at = (radians: number) => scoreTrace(rotate(strokeOf('zigzag'), radians), template);

    it('accuracy falls monotonically as the stroke rotates away', () => {
      const angles = [0, 0.05, 0.1, 0.15, 0.2, 0.3];
      const accuracies = angles.map((a) => at(a).accuracy);
      for (let i = 1; i < accuracies.length; i += 1) {
        expect(accuracies[i]!).toBeLessThan(accuracies[i - 1]!);
      }
    });

    it('passes just above the threshold and fails just below it', () => {
      // Binary-search the rotation where accuracy crosses 0.85.
      let lo = 0;
      let hi = 1.2;
      for (let i = 0; i < 60; i += 1) {
        const mid = (lo + hi) / 2;
        if (at(mid).accuracy >= PASS_THRESHOLD) lo = mid;
        else hi = mid;
      }
      const justInside = at(lo);
      const justOutside = at(hi);

      expect(justInside.accuracy).toBeGreaterThanOrEqual(PASS_THRESHOLD);
      expect(justInside.pass).toBe(true);
      expect(justOutside.accuracy).toBeLessThan(PASS_THRESHOLD);
      expect(justOutside.pass).toBe(false);
      // The crossing is a real interior point, not an artefact at 0 or 1.
      expect(lo).toBeGreaterThan(0.01);
      expect(hi).toBeLessThan(1.2);
    });

    it('pass is exactly accuracy >= 0.85, with no separate rule', () => {
      for (const angle of [0, 0.08, 0.16, 0.24, 0.4, 0.8]) {
        const score = at(angle);
        expect(score.pass).toBe(score.accuracy >= PASS_THRESHOLD);
      }
    });
  });
});
