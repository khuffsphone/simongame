import { expect, test, type Page } from '@playwright/test';
import { installSequenceObserver, startRun, tapPads, waitForAnyCapture } from './helpers';

// CANON §8a / decisions/0021. Android is the target platform.
//
// Headless Chromium does not implement `navigator.vibrate`, so nothing here
// proves a phone buzzes — that stays UNVERIFIED until a device test. What it
// does prove is that the shipped build reaches the vibration API with the
// right pattern at the right moment, which is the part that was previously
// asserted by nobody.

declare global {
  interface Window {
    __vibrations: (number | number[])[];
  }
}

async function installVibrateProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__vibrations = [];
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      writable: true,
      value: (pattern: number | number[]) => {
        window.__vibrations.push(pattern);
        return true;
      },
    });
  });
}

function vibrations(page: Page): Promise<(number | number[])[]> {
  return page.evaluate(() => window.__vibrations.map((v) => v));
}

test.beforeEach(async ({ page }) => {
  await installVibrateProbe(page);
  await installSequenceObserver(page);
  await page.goto('/');
});

test('nothing vibrates before the player touches anything', async ({ page }) => {
  await page.waitForSelector('[data-testid="splash-play"]');
  expect(await vibrations(page)).toEqual([]);
});

test('the entry gesture fires a single perceptible pulse', async ({ page }) => {
  await page.getByTestId('splash-play').click();
  await expect(page.locator('.app')).toHaveAttribute('data-screen', 'menu');
  expect(await vibrations(page)).toEqual([[20]]);
});

test('choosing a mode and starting fire distinct cues', async ({ page }) => {
  await page.getByTestId('splash-play').click();
  await page.getByTestId('mode-color').click();
  await page.getByTestId('menu-start').click();
  await expect(page.locator('.app')).toHaveAttribute('data-screen', 'game');

  expect(await vibrations(page)).toEqual([[20], [20], [30, 40, 60]]);
});

test('a correct step is one short pulse, not a buzz', async ({ page }) => {
  await startRun(page, { mode: 'color' });
  const sequence = await waitForAnyCapture(page);

  const before = (await vibrations(page)).length;
  await page.locator(`.grid--color[data-active="true"] .grid__pad[data-value="${sequence[0]}"]`).click();
  await page.waitForFunction((n) => window.__vibrations.length > n, before);

  const [step] = (await vibrations(page)).slice(before);
  expect(step).toEqual([25]);
});

test('clearing a level fires the level pattern; the first clear is a personal best', async ({
  page,
}) => {
  await startRun(page, { mode: 'color' });
  const sequence = await waitForAnyCapture(page);
  await tapPads(page, sequence);
  await expect(page.getByTestId('hud-level')).toHaveText('2');

  // No prior save, so level 1 is a new best and gets the longer pattern.
  const all = await vibrations(page);
  expect(all).toContainEqual([40, 30, 60, 30, 90, 40, 140]);
  expect(all).not.toContainEqual([40, 30, 60, 30, 90]);
});

test('an ordinary level clear is shorter than a personal best', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'modeshift:v2',
      JSON.stringify({
        version: 2,
        bestLevel: 30,
        bestByMode: { color: 30 },
        lastSeed: null,
        modalityAccuracy: {},
      }),
    );
  });
  await page.reload();

  await startRun(page, { mode: 'color' });
  const sequence = await waitForAnyCapture(page);
  await tapPads(page, sequence);
  await expect(page.getByTestId('hud-level')).toHaveText('2');

  const all = await vibrations(page);
  expect(all).toContainEqual([40, 30, 60, 30, 90]);
  expect(all).not.toContainEqual([40, 30, 60, 30, 90, 40, 140]);
});

test('losing fires the fail pattern and nothing keeps buzzing afterwards', async ({ page }) => {
  await startRun(page, { mode: 'color' });
  const sequence = await waitForAnyCapture(page);
  const wrong = (Number(sequence[0]) + 1) % 4;
  await page.locator(`.grid--color[data-active="true"] .grid__pad[data-value="${wrong}"]`).click();

  await expect(page.getByTestId('overlay')).toHaveAttribute('data-open', 'true');
  expect(await vibrations(page)).toContainEqual([90, 50, 140]);
});

test('leaving the game cancels any running vibration', async ({ page }) => {
  await startRun(page, { mode: 'color' });
  const sequence = await waitForAnyCapture(page);
  const wrong = (Number(sequence[0]) + 1) % 4;
  await page.locator(`.grid--color[data-active="true"] .grid__pad[data-value="${wrong}"]`).click();
  await expect(page.getByTestId('overlay')).toHaveAttribute('data-open', 'true');

  const before = (await vibrations(page)).length;
  // The overlay opens under a finger that is already down, so its buttons
  // ignore the trailing click for 400 ms (justAppearedGuard).
  await page.waitForTimeout(500);
  await page.getByTestId('overlay-menu').click();
  await expect(page.locator('.app')).toHaveAttribute('data-screen', 'menu');

  // The fail buzz is 280 ms long and the overlay can be dismissed inside it.
  // An empty pattern is the cancel.
  expect((await vibrations(page)).slice(before)).toContainEqual([]);
});

test('every pattern the build can emit clears the perception floor', async ({ page }) => {
  // Sweep the whole app and check no pulse below 20 ms ever reaches the API —
  // the class of defect that makes haptics feel broken rather than absent.
  await startRun(page, { mode: 'color', difficulty: 'easy' });
  const sequence = await waitForAnyCapture(page);
  await tapPads(page, sequence);
  await expect(page.getByTestId('hud-level')).toHaveText('2');

  for (const pattern of await vibrations(page)) {
    const beats = Array.isArray(pattern) ? pattern : [pattern];
    beats.forEach((ms, i) => {
      if (i % 2 === 0 && beats.length > 0) {
        expect(ms, `pulse in ${JSON.stringify(pattern)}`).toBeGreaterThanOrEqual(20);
      }
    });
  }
});
