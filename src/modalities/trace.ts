import { abortError, throwIfAborted, wait } from '../core/clock';
import type { Rng } from '../core/rng';
import type { CaptureResult, Modality, ModalityServices, StepScore } from '../core/types';
import {
  MIN_SAMPLE_SPACING_PX,
  TRACE_GLYPHS,
  TRACE_TEMPLATES,
  scoreTrace,
  toSvgPoints,
  type Point,
} from './trace-geometry';
import './trace.css';

// Trace — the level 5 modality. Real gameplay: the glyph is shown, then hidden,
// and the player redraws it from memory. Scoring is CANON §12.

const SVG_NS = 'http://www.w3.org/2000/svg';

export class TraceModality implements Modality<string, Point[]> {
  static readonly id = 'trace';
  static readonly label = 'Trace';
  static readonly blurb = 'Watch the path. Redraw it blind.';
  static readonly minPresentMs = 900;
  static readonly captureTimeoutMs = 9000;

  static generateValue(rng: Rng, _level: number): string {
    return TRACE_GLYPHS[rng.nextInt(TRACE_GLYPHS.length)]!;
  }

  #services: ModalityServices | null = null;
  #root: HTMLElement | null = null;
  #pad: HTMLElement | null = null;
  #expected: SVGPolylineElement | null = null;
  #drawn: SVGPolylineElement | null = null;
  #points: Point[] = [];

  mount(container: HTMLElement, services: ModalityServices): void {
    this.#services = services;

    const root = document.createElement('div');
    root.className = 'trace';
    root.dataset['active'] = 'false';
    root.dataset['armed'] = 'false';

    const pad = document.createElement('div');
    pad.className = 'trace__pad';

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('class', 'trace__svg');
    svg.setAttribute('aria-hidden', 'true');

    const expected = document.createElementNS(SVG_NS, 'polyline');
    expected.setAttribute('class', 'trace__expected');
    const drawn = document.createElementNS(SVG_NS, 'polyline');
    drawn.setAttribute('class', 'trace__drawn');

    svg.append(expected, drawn);
    pad.append(svg);
    root.append(pad);
    container.append(root);

    this.#root = root;
    this.#pad = pad;
    this.#expected = expected;
    this.#drawn = drawn;
  }

  unmount(): void {
    this.#root?.remove();
    this.#root = null;
    this.#pad = null;
    this.#expected = null;
    this.#drawn = null;
    this.#points = [];
    this.#services = null;
  }

  activate(signal: AbortSignal): void {
    if (!this.#root) return;
    this.#root.dataset['active'] = 'true';
    signal.addEventListener('abort', () => this.deactivate(), { once: true });
  }

  deactivate(): void {
    if (!this.#root) return;
    this.#root.dataset['active'] = 'false';
    this.#root.dataset['armed'] = 'false';
    delete this.#root.dataset['stepValue'];
    this.#expected?.setAttribute('points', '');
    this.#drawn?.setAttribute('points', '');
    this.#points = [];
  }

  async presentStep(value: string, durationMs: number, signal: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    const root = this.#root;
    const template = TRACE_TEMPLATES[value];
    if (!root || !template || !this.#services) throw new Error(`Unknown glyph "${value}"`);

    root.dataset['stepValue'] = value;
    this.#drawn?.setAttribute('points', '');
    this.#expected?.setAttribute('points', toSvgPoints(template));
    root.dataset['showing'] = 'true';
    this.#services.audio.tone({ freq: 587.33, durationMs: 220, type: 'triangle', gain: 0.3 });

    try {
      await wait(this.#services.clock, durationMs, signal);
    } finally {
      // The glyph must be gone before capture — it is a memory game.
      this.#expected?.setAttribute('points', '');
      delete root.dataset['showing'];
      delete root.dataset['stepValue'];
    }
  }

  captureStep(signal: AbortSignal): Promise<CaptureResult<Point[]>> {
    return new Promise<CaptureResult<Point[]>>((resolve, reject) => {
      const root = this.#root;
      const pad = this.#pad;
      if (!root || !pad) {
        reject(new Error('captureStep called before mount'));
        return;
      }
      if (signal.aborted) {
        reject(abortError());
        return;
      }

      this.#points = [];
      this.#drawn?.setAttribute('points', '');
      root.dataset['armed'] = 'true';

      let drawing = false;

      const push = (event: PointerEvent): void => {
        const rect = pad.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        const last = this.#points[this.#points.length - 1];
        // 2px minimum spacing is the only filtering: no smoothing, no prediction.
        if (last && Math.hypot(point.x - last.x, point.y - last.y) < MIN_SAMPLE_SPACING_PX) return;
        this.#points.push(point);
        this.#renderDrawn(rect.width, rect.height);
      };

      const finish = (): void => {
        root.dataset['armed'] = 'false';
        resolve({
          value: this.#points.slice(),
          meta: { samples: this.#points.length },
        });
      };

      pad.addEventListener(
        'pointerdown',
        (event: PointerEvent) => {
          event.preventDefault();
          drawing = true;
          pad.setPointerCapture?.(event.pointerId);
          push(event);
        },
        { signal },
      );

      pad.addEventListener(
        'pointermove',
        (event: PointerEvent) => {
          if (!drawing) return;
          event.preventDefault();
          // Coalesced events keep fast strokes from losing their samples.
          const events = event.getCoalescedEvents?.() ?? [event];
          for (const e of events) push(e);
        },
        { signal },
      );

      pad.addEventListener(
        'pointerup',
        (event: PointerEvent) => {
          if (!drawing) return;
          event.preventDefault();
          drawing = false;
          push(event);
          finish();
        },
        { signal },
      );

      signal.addEventListener(
        'abort',
        () => {
          root.dataset['armed'] = 'false';
          reject(abortError());
        },
        { once: true },
      );
    });
  }

  scoreStep(input: CaptureResult<Point[]>, expected: string): StepScore {
    const template = TRACE_TEMPLATES[expected];
    if (!template) return { pass: false, accuracy: 0 };
    const result = scoreTrace(input.value, template);
    return { pass: result.pass, accuracy: result.accuracy };
  }

  #renderDrawn(width: number, height: number): void {
    if (!this.#drawn || width === 0 || height === 0) return;
    const scaled = this.#points.map((p) => ({ x: p.x / width, y: p.y / height }));
    this.#drawn.setAttribute('points', toSvgPoints(scaled));
  }
}
