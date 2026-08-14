import { describe, expect, it } from 'vitest';
import type { EngineEvents } from '../src/core/engine';
import { ModalityRegistry } from '../src/core/registry';
import {
  ColorModality,
  NumberModality,
  RhythmModality,
  ShapeModality,
  SoundModality,
  TraceModality,
} from '../src/modalities';
import { describePattern } from '../src/modalities/rhythm';
import { describeFailure } from '../src/ui/reveal';

// CANON §6 / decisions/0020: a run may not end without saying what the answer
// was. These are the actual strings a player reads.

const registry = new ModalityRegistry()
  .register(ColorModality)
  .register(NumberModality)
  .register(ShapeModality)
  .register(SoundModality)
  .register(TraceModality)
  .register(RhythmModality);

function fail(over: Partial<EngineEvents['fail']> = {}): EngineEvents['fail'] {
  return {
    reason: 'wrong-step',
    level: 7,
    seed: 1234,
    expected: null,
    received: null,
    accuracy: null,
    ...over,
  };
}

describe('describeFailure', () => {
  it('names the answer and what the player gave', () => {
    const { title, body } = describeFailure(
      registry,
      fail({ expected: { modalityId: 'color', value: 3 }, received: 1, accuracy: 0 }),
    );
    expect(title).toBe('RUN OVER');
    expect(body).toBe('Wrong step. The answer was Blue. You gave Red. You reached level 7.');
  });

  it('names the answer on a timeout, and does not invent an input', () => {
    const body = describeFailure(
      registry,
      fail({ reason: 'timeout', expected: { modalityId: 'shape', value: 2 } }),
    ).body;
    expect(body).toBe('Out of time. The answer was Triangle. You reached level 7.');
    expect(body).not.toContain('You gave');
  });

  it('says nothing about a step when the run ended for leaving', () => {
    const body = describeFailure(registry, fail({ reason: 'focus-lost' })).body;
    expect(body).toBe('You left the game twice. You reached level 7.');
  });

  it('describes a trace answer by name and the attempt by its shortfall', () => {
    const body = describeFailure(
      registry,
      fail({
        expected: { modalityId: 'trace', value: 'zigzag' },
        received: [{ x: 1, y: 1 }, { x: 2, y: 2 }],
        accuracy: 0,
      }),
    ).body;
    expect(body).toContain('The answer was a zigzag.');
    expect(body).toContain('You gave a tap, not a stroke.');
  });

  it('describes a rhythm answer in taps and gaps, not milliseconds', () => {
    const body = describeFailure(
      registry,
      fail({
        expected: { modalityId: 'rhythm', value: { pattern: 4 } },
        received: [200, 200, 200],
        accuracy: 0.2,
      }),
    ).body;
    // Pattern 4 is [200, 200, 200, 600] — five taps, last gap long.
    expect(body).toContain('The answer was 5 taps · short · short · short · long.');
    expect(body).toContain('You gave 4 taps, evenly spaced.');
    expect(body).not.toMatch(/\d+ ?ms/);
  });

  it('does not repeat itself when answer and attempt describe the same', () => {
    // Trace and rhythm score by shape, so a failing attempt can carry the same
    // description as the answer. "You drew a V. You drew a V." reads as a bug.
    const body = describeFailure(
      registry,
      fail({
        expected: { modalityId: 'rhythm', value: { pattern: 0 } },
        received: [420, 421, 419],
        accuracy: 0.7,
      }),
    ).body;
    expect(body).toBe('Wrong step. The answer was 4 taps, evenly spaced. You reached level 7.');
  });

  it('still reports the level when the modality is not registered', () => {
    const empty = new ModalityRegistry().register(ColorModality);
    const body = describeFailure(
      empty,
      fail({ expected: { modalityId: 'trace', value: 'vee' }, received: [] }),
    ).body;
    expect(body).toBe('Wrong step. You reached level 7.');
  });

  it('survives a modality whose formatter throws', () => {
    class Exploding extends ColorModality {
      static override describeValue(): string {
        throw new Error('nope');
      }
    }
    // Both lines are dropped — the discrete `describeCapture` delegates to
    // `describeValue`, so the same throw takes out both. The overlay still
    // opens, which is the property that matters: a broken formatter must not
    // leave the player staring at a dead screen.
    const body = describeFailure(
      new ModalityRegistry().register(Exploding),
      fail({ expected: { modalityId: 'color', value: 0 }, received: 1 }),
    ).body;
    expect(body).toBe('Wrong step. You reached level 7.');
  });

  it('never ends a run without saying something concrete', () => {
    for (const reason of ['wrong-step', 'timeout', 'focus-lost'] as const) {
      const body = describeFailure(registry, fail({ reason })).body;
      expect(body.length).toBeGreaterThan(0);
      expect(body).toContain('level 7');
    }
  });
});

describe('every registered modality can name its own answers', () => {
  // The regression guard for the defect itself: a modality added without a
  // reveal is a modality that ends the game with "Wrong step." and nothing.
  it.each([
    ['color', 0, 'Green'],
    ['number', 3, '4'],
    ['shape', 3, 'Star'],
    ['sound', 0, 'G3, the lowest'],
    ['trace', 'ell', 'an L'],
  ])('%s describes %o as %s', (id, value, expected) => {
    expect(registry.require(id).describeValue(value)).toBe(expected);
  });

  it('produces a non-empty description for every value each modality can generate', () => {
    const samples: Record<string, unknown[]> = {
      color: [0, 1, 2, 3],
      number: [0, 1, 2, 3],
      shape: [0, 1, 2, 3],
      sound: [0, 1, 2, 3],
      trace: ['line', 'vee', 'ell', 'arc', 'zigzag', 'wave'],
      rhythm: [0, 1, 2, 3, 4].map((pattern) => ({ pattern })),
    };
    for (const ModalityCtor of registry.all()) {
      for (const value of samples[ModalityCtor.id]!) {
        const text = ModalityCtor.describeValue(value);
        expect(text, `${ModalityCtor.id} ${JSON.stringify(value)}`).toBeTruthy();
        // An identifier leaking through is a missing entry, not a description.
        expect(text).not.toBe(String(value));
      }
    }
  });
});

describe('describePattern', () => {
  it('calls an even pattern even rather than listing it', () => {
    expect(describePattern([420, 420, 420])).toBe('4 taps, evenly spaced');
  });

  it('marks a gap long once it is 1.6x the shortest', () => {
    expect(describePattern([220, 220, 560])).toBe('4 taps · short · short · long');
    expect(describePattern([300, 600, 300])).toBe('4 taps · short · long · short');
  });

  it('handles a single tap with no intervals at all', () => {
    expect(describePattern([])).toBe('1 tap');
  });
});
