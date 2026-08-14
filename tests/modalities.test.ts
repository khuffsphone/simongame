import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSilentAudioService } from '../src/core/audio';
import { isAbortError, rafClock } from '../src/core/clock';
import { createRng } from '../src/core/rng';
import type { Modality, ModalityServices } from '../src/core/types';
import { ColorModality, NumberModality, createDefaultRegistry } from '../src/modalities';

const services: ModalityServices = {
  audio: createSilentAudioService('running'),
  clock: rafClock,
  reducedMotion: false,
};

/** jsdom does not always ship PointerEvent; MouseEvent carries the same path. */
function tap(element: Element): void {
  const Ctor =
    (globalThis as unknown as { PointerEvent?: typeof MouseEvent }).PointerEvent ?? MouseEvent;
  element.dispatchEvent(new Ctor('pointerdown', { bubbles: true, cancelable: true }));
}

function mountModality(instance: Modality<number>): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  instance.mount(container, services);
  return container;
}

describe('registry', () => {
  it('registers all six modalities, in menu order', () => {
    expect(createDefaultRegistry().ids()).toEqual([
      'color',
      'number',
      'shape',
      'sound',
      'trace',
      'rhythm',
    ]);
  });

  it('refuses a duplicate id', () => {
    const registry = createDefaultRegistry();
    expect(() => registry.register(ColorModality)).toThrow(/already registered/i);
  });

  it('require() names the missing modality', () => {
    expect(() => createDefaultRegistry().require('smell')).toThrow(/"smell" is not registered/);
  });
});

describe.each([
  ['color', ColorModality],
  ['number', NumberModality],
] as const)('%s modality contract', (id, ModalityCtor) => {
  it('declares its statics', () => {
    expect(ModalityCtor.id).toBe(id);
    expect(ModalityCtor.minPresentMs).toBeGreaterThan(0);
    expect(ModalityCtor.captureTimeoutMs).toBe(3000);
  });

  it('generates values inside its own cardinality of 4', () => {
    const rng = createRng(31);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i += 1) {
      const value = ModalityCtor.generateValue(rng, 1);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(4);
      seen.add(value);
    }
    expect(seen.size).toBe(4);
  });

  it('generates deterministically for a fixed seed', () => {
    const a = Array.from({ length: 10 }, ((rng) => () => ModalityCtor.generateValue(rng, 3))(
      createRng(5),
    ));
    const b = Array.from({ length: 10 }, ((rng) => () => ModalityCtor.generateValue(rng, 3))(
      createRng(5),
    ));
    expect(a).toEqual(b);
  });

  it('scores every input against every expectation', () => {
    const instance = new ModalityCtor();
    for (let input = 0; input < 4; input += 1) {
      for (let expected = 0; expected < 4; expected += 1) {
        const score = instance.scoreStep({ value: input, meta: {} }, expected);
        expect(score.pass).toBe(input === expected);
        expect(score.accuracy).toBe(input === expected ? 1 : 0);
      }
    }
  });

  it('builds exactly four 44px-capable pads into its own container', () => {
    const instance = new ModalityCtor();
    const container = mountModality(instance);
    const pads = container.querySelectorAll('.grid__pad');
    expect(pads).toHaveLength(4);
    for (const pad of pads) {
      expect(pad.tagName).toBe('BUTTON');
      expect(pad.getAttribute('aria-label')).toBeTruthy();
    }
    instance.unmount();
    expect(container.querySelectorAll('.grid__pad')).toHaveLength(0);
    container.remove();
  });
});

describe('discrete capture and presentation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('marks the presented pad for exactly the presentation window', async () => {
    const instance = new ColorModality();
    const container = mountModality(instance);
    const controller = new AbortController();
    const root = container.querySelector('.grid') as HTMLElement;
    const pad = container.querySelector('.grid__pad[data-value="2"]') as HTMLElement;

    const presenting = instance.presentStep(2, 300, controller.signal);
    expect(pad.dataset['presenting']).toBe('true');
    expect(root.dataset['stepValue']).toBe('2');

    await vi.advanceTimersByTimeAsync(400);
    await presenting;

    expect(pad.dataset['presenting']).toBe('false');
    expect(root.dataset['stepValue']).toBeUndefined();

    instance.unmount();
    container.remove();
  });

  it('resolves capture on pointerdown, reporting the tapped value', async () => {
    const instance = new NumberModality();
    const container = mountModality(instance);
    const controller = new AbortController();

    const capture = instance.captureStep(controller.signal);
    const root = container.querySelector('.grid') as HTMLElement;
    expect(root.dataset['armed']).toBe('true');

    tap(container.querySelector('.grid__pad[data-value="3"]')!);
    await expect(capture).resolves.toMatchObject({ value: 3 });
    expect(root.dataset['armed']).toBe('false');

    instance.unmount();
    container.remove();
  });

  it('rejects with AbortError and disarms when the engine aborts the step', async () => {
    const instance = new ColorModality();
    const container = mountModality(instance);
    const controller = new AbortController();

    const capture = instance.captureStep(controller.signal);
    controller.abort();

    await expect(capture).rejects.toSatisfy(isAbortError);
    const root = container.querySelector('.grid') as HTMLElement;
    expect(root.dataset['armed']).toBe('false');

    // Listeners were bound to the aborted signal, so a late tap does nothing.
    tap(container.querySelector('.grid__pad[data-value="0"]')!);

    instance.unmount();
    container.remove();
  });

  it('rejects immediately when handed an already-aborted signal', async () => {
    const instance = new ColorModality();
    const container = mountModality(instance);
    await expect(instance.captureStep(AbortSignal.abort())).rejects.toSatisfy(isAbortError);
    instance.unmount();
    container.remove();
  });

  it('hides itself when the level signal aborts', () => {
    const instance = new ColorModality();
    const container = mountModality(instance);
    const level = new AbortController();
    const root = container.querySelector('.grid') as HTMLElement;

    instance.activate(level.signal);
    expect(root.dataset['active']).toBe('true');

    level.abort();
    expect(root.dataset['active']).toBe('false');

    instance.unmount();
    container.remove();
  });
});
