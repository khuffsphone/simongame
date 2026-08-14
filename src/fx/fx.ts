import type { Clock } from '../core/clock';
import { rafClock } from '../core/clock';
import './fx.css';

// Canvas particle FX — CANON §14.
//
// Hard rules, all testable:
//  - the rAF loop starts only when a particle exists and stops the frame after
//    the last one dies (`isLooping` is the assertion surface);
//  - device pixel ratio is capped;
//  - particle count is capped, and the cap drops under prefers-reduced-motion;
//  - no per-particle shadowBlur — the one glow is a single cheap radial draw;
//  - `clear()` wipes everything, and the engine calls it before PRESENTING.

export type ParticleKind = 'confetti' | 'coin' | 'spark' | 'balloon';

interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  age: number;
  life: number;
  spin: number;
  spinSpeed: number;
}

const MAX_PARTICLES = 220;
const MAX_PARTICLES_REDUCED = 40;
const MAX_DPR = 1.5;
const GRAVITY = 900;

const CONFETTI_COLORS = ['#ff2f6d', '#ffd23f', '#3ddbff', '#7cff6b', '#c46bff', '#ffffff'];
const BALLOON_COLORS = ['#ff2f6d', '#ffd23f', '#3ddbff', '#7cff6b', '#c46bff'];

const rand = (min: number, max: number): number => min + Math.random() * (max - min);
const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;

export interface FxOptions {
  clock?: Clock;
  reducedMotion?: boolean;
  container?: HTMLElement;
  /**
   * Test seam: jsdom has no 2D canvas, so the loop would never start and the
   * lifecycle assertions would pass vacuously. Tests inject a stub context.
   */
  contextFactory?: (canvas: HTMLCanvasElement) => CanvasRenderingContext2D | null;
}

export class Fx {
  #canvas: HTMLCanvasElement | null = null;
  #ctx: CanvasRenderingContext2D | null = null;
  #particles: Particle[] = [];
  #handle = 0;
  #last = 0;
  #clock: Clock;
  #reduced: boolean;
  #container: HTMLElement;
  #contextFactory: (canvas: HTMLCanvasElement) => CanvasRenderingContext2D | null;
  #onResize = (): void => this.#resize();

  constructor(options: FxOptions = {}) {
    this.#clock = options.clock ?? rafClock;
    this.#reduced = options.reducedMotion ?? false;
    this.#container = options.container ?? document.body;
    this.#contextFactory = options.contextFactory ?? ((canvas) => canvas.getContext('2d'));
  }

  mount(): void {
    if (this.#canvas) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'fx-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    this.#container.append(canvas);
    this.#canvas = canvas;
    this.#ctx = this.#contextFactory(canvas);
    window.addEventListener('resize', this.#onResize);
    this.#resize();
  }

  destroy(): void {
    this.clear();
    window.removeEventListener('resize', this.#onResize);
    this.#canvas?.remove();
    this.#canvas = null;
    this.#ctx = null;
  }

  /** Live assertion surface: true only while the rAF loop is scheduled. */
  get isLooping(): boolean {
    return this.#handle !== 0;
  }

  get particleCount(): number {
    return this.#particles.length;
  }

  get maxParticles(): number {
    return this.#reduced ? MAX_PARTICLES_REDUCED : MAX_PARTICLES;
  }

  setReducedMotion(reduced: boolean): void {
    this.#reduced = reduced;
    if (reduced) this.#particles.length = Math.min(this.#particles.length, this.maxParticles);
  }

  /** Wipe every particle and stop the loop. Called before PRESENTING. */
  clear(): void {
    this.#particles.length = 0;
    if (this.#handle) {
      this.#clock.cancel(this.#handle);
      this.#handle = 0;
    }
    this.#wipe();
  }

  // --- emitters -----------------------------------------------------------

  /** Short burst for a correct step. Deliberately tiny. */
  spark(x: number, y: number, count = 7): void {
    const n = this.#reduced ? Math.min(3, count) : count;
    for (let i = 0; i < n; i += 1) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(140, 520);
      this.#add({
        kind: 'spark',
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: rand(2, 4.5),
        color: pick(['#ffd23f', '#fff3b0', '#ffffff']),
        age: 0,
        life: rand(0.28, 0.6),
        spin: 0,
        spinSpeed: 0,
      });
    }
  }

  /** Menu / selection accent. */
  burst(x: number, y: number, count = 18): void {
    const n = this.#reduced ? Math.min(8, count) : count;
    for (let i = 0; i < n; i += 1) {
      const angle = rand(-Math.PI, 0);
      const speed = rand(220, 720);
      this.#add({
        kind: 'confetti',
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: rand(6, 13),
        color: pick(CONFETTI_COLORS),
        age: 0,
        life: rand(1.1, 2.1),
        spin: rand(0, 6.3),
        spinSpeed: rand(-11, 11),
      });
    }
  }

  /** Level-complete celebration. `intensity` scales with the level. */
  jackpot(intensity = 1): void {
    const scale = this.#reduced ? 0.3 : Math.min(1.6, intensity);
    const w = this.#width();
    const h = this.#height();

    this.#cannon(0, h, -Math.PI / 3.2, Math.round(22 * scale));
    this.#cannon(w, h, -Math.PI + Math.PI / 3.2, Math.round(22 * scale));
    this.#coins(w / 2, h * 0.55, Math.round(12 * scale));
    if (!this.#reduced) this.#balloons(Math.round(4 * scale));
  }

  /** Failure: brief and dark, not a celebration. */
  bust(): void {
    const w = this.#width();
    const h = this.#height();
    const n = this.#reduced ? 5 : 16;
    for (let i = 0; i < n; i += 1) {
      this.#add({
        kind: 'coin',
        x: rand(0, w),
        y: rand(-h * 0.3, -20),
        vx: rand(-40, 40),
        vy: rand(180, 420),
        size: rand(8, 16),
        color: '#8892a6',
        age: 0,
        life: rand(1.2, 2.2),
        spin: rand(0, 6.3),
        spinSpeed: rand(5, 12),
      });
    }
  }

  #cannon(x: number, y: number, angle: number, count: number): void {
    for (let i = 0; i < count; i += 1) {
      const a = angle + rand(-0.4, 0.4);
      const speed = rand(650, 1350);
      this.#add({
        kind: 'confetti',
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        size: rand(7, 15),
        color: pick(CONFETTI_COLORS),
        age: 0,
        life: rand(1.6, 2.8),
        spin: rand(0, 6.3),
        spinSpeed: rand(-12, 12),
      });
    }
  }

  #coins(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i += 1) {
      const a = rand(-Math.PI * 0.9, -Math.PI * 0.1);
      const speed = rand(280, 640);
      this.#add({
        kind: 'coin',
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        size: rand(9, 18),
        color: '#ffd23f',
        age: 0,
        life: rand(1.3, 2.4),
        spin: rand(0, 6.3),
        spinSpeed: rand(6, 14),
      });
    }
  }

  #balloons(count: number): void {
    const w = this.#width();
    const h = this.#height();
    for (let i = 0; i < count; i += 1) {
      this.#add({
        kind: 'balloon',
        x: rand(24, w - 24),
        y: h + rand(20, 160),
        vx: rand(-18, 18),
        vy: -rand(110, 200),
        size: rand(18, 34),
        color: pick(BALLOON_COLORS),
        age: 0,
        life: rand(2.6, 4.2),
        spin: rand(0, 6.3),
        spinSpeed: rand(-0.8, 0.8),
      });
    }
  }

  // --- loop ---------------------------------------------------------------

  #add(particle: Particle): void {
    if (this.#particles.length >= this.maxParticles) return;
    this.#particles.push(particle);
    this.#ensureLoop();
  }

  #ensureLoop(): void {
    if (this.#handle || !this.#ctx) return;
    this.#last = 0;
    this.#handle = this.#clock.frame((t) => this.#tick(t));
  }

  #tick(timestamp: number): void {
    const ctx = this.#ctx;
    if (!ctx) {
      this.#handle = 0;
      return;
    }
    if (this.#last === 0) this.#last = timestamp;
    const dt = Math.min(0.05, (timestamp - this.#last) / 1000);
    this.#last = timestamp;

    ctx.clearRect(0, 0, this.#width(), this.#height());

    for (let i = this.#particles.length - 1; i >= 0; i -= 1) {
      const p = this.#particles[i]!;
      p.age += dt;
      if (p.age >= p.life) {
        this.#particles.splice(i, 1);
        continue;
      }
      this.#update(p, dt);
      this.#draw(ctx, p);
    }

    if (this.#particles.length === 0) {
      // Last particle died: stop the loop rather than idling at 60fps.
      this.#handle = 0;
      this.#wipe();
      return;
    }
    this.#handle = this.#clock.frame((t) => this.#tick(t));
  }

  #update(p: Particle, dt: number): void {
    if (p.kind === 'balloon') {
      p.vy -= 12 * dt;
      p.x += Math.sin(p.age * 2.4) * 12 * dt;
    } else {
      p.vy += GRAVITY * dt;
      p.vx *= 0.985;
      p.vy *= 0.985;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.spin += p.spinSpeed * dt;
  }

  #draw(ctx: CanvasRenderingContext2D, p: Particle): void {
    const alpha = Math.max(0, 1 - p.age / p.life);
    ctx.save();
    ctx.globalAlpha = alpha;
    // No shadowBlur anywhere: it is the single most expensive canvas op on
    // mobile and it is what tanks FPS at high particle counts.
    switch (p.kind) {
      case 'coin': {
        ctx.translate(p.x, p.y);
        ctx.scale(Math.max(0.12, Math.abs(Math.cos(p.spin))), 1);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'balloon': {
        ctx.translate(p.x, p.y);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size * 0.72, p.size, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'spark': {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      default: {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.spin);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.62);
      }
    }
    ctx.restore();
  }

  // --- canvas -------------------------------------------------------------

  #width(): number {
    return this.#canvas ? this.#canvas.clientWidth || window.innerWidth : window.innerWidth;
  }

  #height(): number {
    return this.#canvas ? this.#canvas.clientHeight || window.innerHeight : window.innerHeight;
  }

  #wipe(): void {
    this.#ctx?.clearRect(0, 0, this.#width(), this.#height());
  }

  #resize(): void {
    const canvas = this.#canvas;
    const ctx = this.#ctx;
    if (!canvas || !ctx) return;
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}
