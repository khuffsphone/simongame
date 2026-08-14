import type { Page } from '@playwright/test';

declare global {
  interface Window {
    __audioProbe: { constructed: number; state: () => string | null };
    __presented: number[];
  }
}

/**
 * Count AudioContext constructions before the page script runs, so the test can
 * prove none happens before the first gesture (CANON §9).
 */
export async function installAudioProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const Original = window.AudioContext;
    let latest: AudioContext | null = null;
    const probe = {
      constructed: 0,
      state: () => latest?.state ?? null,
    };
    class CountedAudioContext extends Original {
      constructor() {
        super();
        probe.constructed += 1;
        latest = this;
      }
    }
    window.AudioContext = CountedAudioContext as unknown as typeof AudioContext;
    window.__audioProbe = probe;
  });
}

/**
 * Record the presented sequence by observing the DOM rather than reading engine
 * state (decisions/0007). A MutationObserver cannot miss a beat the way polling
 * against an 800 ms presentation clock can.
 */
export async function installSequenceObserver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__presented = [];
    const attach = (): boolean => {
      const stage = document.querySelector('[data-testid="stage"]');
      if (!stage) return false;
      new MutationObserver((records) => {
        for (const record of records) {
          if (record.attributeName !== 'data-presenting') continue;
          const element = record.target as HTMLElement;
          if (element.dataset['presenting'] === 'true') {
            window.__presented.push(Number(element.dataset['value']));
          }
        }
      }).observe(stage, {
        subtree: true,
        attributes: true,
        attributeFilter: ['data-presenting'],
      });
      return true;
    };
    if (!attach()) document.addEventListener('DOMContentLoaded', () => attach(), { once: true });
  });
}

export function presentedCount(page: Page): Promise<number> {
  return page.evaluate(() => window.__presented.length);
}

export function presentedValues(page: Page): Promise<number[]> {
  return page.evaluate(() => [...window.__presented]);
}

/** Wait until the engine has finished presenting `total` steps and opened capture. */
export async function waitForCapture(page: Page, total: number): Promise<void> {
  await page.waitForFunction((n) => window.__presented.length >= n, total, { timeout: 15_000 });
  await page.locator('.grid[data-armed="true"]').waitFor({ state: 'attached', timeout: 15_000 });
}

/** Tap the pads for `values`, in order. */
export async function tapSequence(page: Page, values: number[]): Promise<void> {
  for (const value of values) {
    await page.locator(`.grid[data-active="true"] .grid__pad[data-value="${value}"]`).tap();
  }
}

/**
 * Drive the page's visibility state. Playwright cannot background a tab, so the
 * test overrides `document.hidden`/`visibilityState` and fires the same
 * `visibilitychange` event the browser would — the production handler runs
 * unmodified. This is a faithful stand-in for the code path, not for the OS.
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
