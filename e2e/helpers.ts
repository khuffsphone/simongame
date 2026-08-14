import { expect, type Page } from '@playwright/test';

declare global {
  interface Window {
    __audioProbe: { constructed: number; state: () => string | null };
    __presented: string[];
    __glyphs: string[];
    __armed: string[];
  }
}

/** Prove no AudioContext exists before the first gesture (CANON §9). */
export async function installAudioProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const Original = window.AudioContext;
    let latest: AudioContext | null = null;
    const probe = { constructed: 0, state: () => latest?.state ?? null };
    class Counted extends Original {
      constructor() {
        super();
        probe.constructed += 1;
        latest = this;
      }
    }
    window.AudioContext = Counted as unknown as typeof AudioContext;
    window.__audioProbe = probe;
  });
}

/**
 * Record the presented sequence from the DOM (decisions/0007).
 *
 * Every modality marks its root with `data-step-value` while presenting, which
 * is the one hook that works for all six — including sound, where no pad lights
 * up, and trace, where the "value" is a glyph name. The trace glyph geometry is
 * captured too, so a spec can replay the path it was shown.
 */
export async function installSequenceObserver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__presented = [];
    window.__glyphs = [];
    window.__armed = [];
    new MutationObserver((records) => {
      for (const record of records) {
        const target = record.target as HTMLElement;
        if (record.attributeName === 'data-step-value') {
          const value = target.dataset['stepValue'];
          if (value !== undefined) window.__presented.push(value);
        }
        if (record.attributeName === 'data-armed') {
          const armed = target.dataset['armed'];
          if (armed !== undefined) window.__armed.push(armed);
        }
        if (record.attributeName === 'points' && target.classList.contains('trace__expected')) {
          const points = target.getAttribute('points');
          if (points) window.__glyphs.push(points);
        }
      }
      // `document` rather than `document.documentElement`: init scripts run
      // before the root element exists, and observing it throws
      // "parameter 1 is not of type 'Node'" — silently, in an init script,
      // leaving the observer detached and every sequence assertion vacuous.
    }).observe(document, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-step-value', 'points', 'data-armed'],
    });
  });
}

export function presented(page: Page): Promise<string[]> {
  return page.evaluate(() => [...window.__presented]);
}

export function glyphs(page: Page): Promise<string[]> {
  return page.evaluate(() => [...window.__glyphs]);
}

/** Every `data-armed` transition, so a spec can prove a capture closed. */
export function armedTransitions(page: Page): Promise<string[]> {
  return page.evaluate(() => [...window.__armed]);
}

export interface StartOptions {
  mode?: string;
  difficulty?: 'easy' | 'normal' | 'hard';
}

/** Splash -> menu -> game, the way a player gets there. */
export async function startRun(page: Page, options: StartOptions = {}): Promise<void> {
  await page.getByTestId('splash-play').click();
  await expect(page.locator('.app')).toHaveAttribute('data-screen', 'menu');

  if (options.mode) await page.getByTestId(`mode-${options.mode}`).click();
  if (options.difficulty) await page.getByTestId(`difficulty-${options.difficulty}`).click();

  await page.getByTestId('menu-start').click();
  await expect(page.locator('.app')).toHaveAttribute('data-screen', 'game');
}

/**
 * Wait until capture opens, however many steps the level generated.
 *
 * Prefer this over `waitForCapture(page, n)` for anything that is not
 * specifically asserting a step count: levels are generated against a
 * cognitive budget, so an expensive modality produces fewer steps than a
 * cheap one at the same level (CANON §4).
 */
export async function waitForAnyCapture(page: Page): Promise<string[]> {
  await page.waitForFunction(() => window.__presented.length >= 1, undefined, { timeout: 30_000 });
  await page.locator('[data-armed="true"]').first().waitFor({ state: 'attached', timeout: 30_000 });
  return presented(page);
}

/** Wait until `total` steps have been presented and capture has opened. */
export async function waitForCapture(page: Page, total: number): Promise<void> {
  await page.waitForFunction((n) => window.__presented.length >= n, total, { timeout: 30_000 });
  await page.locator('[data-armed="true"]').first().waitFor({ state: 'attached', timeout: 30_000 });
}

/** Tap the discrete pads for `values`, in order. */
export async function tapPads(page: Page, values: string[]): Promise<void> {
  for (const value of values) {
    await page.locator(`.grid[data-active="true"] .grid__pad[data-value="${value}"]`).click();
  }
}

/**
 * Drive the page's visibility state. Playwright cannot background a tab, so the
 * test overrides `document.hidden`/`visibilityState` and fires the same
 * `visibilitychange` event the browser would — the production handler runs
 * unmodified. A faithful stand-in for the code path, not for the OS.
 */
export async function setHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((isHidden) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => isHidden });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (isHidden ? 'hidden' : 'visible'),
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}
