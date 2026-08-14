import { expect, test } from '@playwright/test';
import {
  installAudioProbe,
  installSequenceObserver,
  presented,
  setHidden,
  startRun,
  tapPads,
  waitForCapture,
} from './helpers';

// Gameplay e2e against the built single-file artifact, Pixel 5, headless.

const COLOR_LEVEL_1_STEPS = 3;

test.beforeEach(async ({ page }) => {
  await installAudioProbe(page);
  await installSequenceObserver(page);
  await page.goto('/');
});

test('no AudioContext exists before the first gesture, and it runs after', async ({ page }) => {
  expect(await page.evaluate(() => window.__audioProbe.constructed)).toBe(0);
  await expect(page.locator('.app')).toHaveAttribute('data-screen', 'splash');

  await page.getByTestId('splash-play').click();

  await expect(page.locator('.app')).toHaveAttribute('data-screen', 'menu');
  expect(await page.evaluate(() => window.__audioProbe.constructed)).toBe(1);
  expect(await page.evaluate(() => window.__audioProbe.state())).toBe('running');
});

test('colour level 1 completes and the run advances to level 2', async ({ page }) => {
  await startRun(page, { mode: 'color' });
  await waitForCapture(page, COLOR_LEVEL_1_STEPS);

  const sequence = await presented(page);
  expect(sequence).toHaveLength(COLOR_LEVEL_1_STEPS);

  await tapPads(page, sequence);
  await expect(page.getByTestId('hud-level')).toHaveText('2');
  await expect(page.getByTestId('hud-combo')).toHaveText('3');
});

test('a wrong tap ends the run immediately (0 lives)', async ({ page }) => {
  await startRun(page, { mode: 'color' });
  await waitForCapture(page, COLOR_LEVEL_1_STEPS);

  const sequence = await presented(page);
  const wrong = String((Number(sequence[0]) + 1) % 4);
  await tapPads(page, [wrong]);

  await expect(page.locator('.app')).toHaveAttribute('data-state', 'FAIL');
  await expect(page.getByTestId('overlay-title')).toHaveText('RUN OVER');
  await expect(page.getByTestId('overlay-body')).toContainText('Wrong step.');
});

test('backgrounding mid-capture pauses, and resuming replays with no phantom timeout', async ({
  page,
}) => {
  await startRun(page, { mode: 'color' });
  await waitForCapture(page, COLOR_LEVEL_1_STEPS);
  const firstPass = await presented(page);

  await setHidden(page, true);
  await expect(page.locator('.app')).toHaveAttribute('data-state', 'PAUSED');
  await expect(page.getByTestId('overlay-title')).toHaveText('Paused');
  await expect(page.getByTestId('hud-replays')).toHaveText('1');

  // Well past the 3000 ms capture timeout that was armed before the pause.
  await page.waitForTimeout(4500);
  await expect(page.locator('.app')).toHaveAttribute('data-state', 'PAUSED');

  await setHidden(page, false);
  await waitForCapture(page, COLOR_LEVEL_1_STEPS * 2);

  const all = await presented(page);
  expect(all.slice(COLOR_LEVEL_1_STEPS, COLOR_LEVEL_1_STEPS * 2)).toEqual(firstPass);
  await expect(page.getByTestId('hud-replays')).toHaveText('0');

  await tapPads(page, firstPass);
  await expect(page.getByTestId('hud-level')).toHaveText('2');
});

test('a second backgrounding ends the run', async ({ page }) => {
  await startRun(page, { mode: 'color' });
  await waitForCapture(page, COLOR_LEVEL_1_STEPS);

  await setHidden(page, true);
  await expect(page.locator('.app')).toHaveAttribute('data-state', 'PAUSED');
  await setHidden(page, false);
  await expect(page.locator('.app')).toHaveAttribute('data-state', 'PRESENTING');
  await expect(page.getByTestId('hud-replays')).toHaveText('0');

  await setHidden(page, true);
  await expect(page.locator('.app')).toHaveAttribute('data-state', 'FAIL');
  await expect(page.getByTestId('overlay-body')).toContainText('You left the game twice.');
});

test('the failure overlay can restart the run and return to the menu', async ({ page }) => {
  await startRun(page, { mode: 'color' });
  await waitForCapture(page, COLOR_LEVEL_1_STEPS);
  const sequence = await presented(page);
  await tapPads(page, [String((Number(sequence[0]) + 1) % 4)]);
  await expect(page.getByTestId('overlay-title')).toHaveText('RUN OVER');

  // The overlay opens under a finger that is already down, so its buttons
  // ignore activation for 400 ms (decisions/0015). Wait that out, as a player
  // reacting to the failure would.
  await page.waitForTimeout(500);
  await page.getByTestId('overlay-menu').click();
  await expect(page.locator('.app')).toHaveAttribute('data-screen', 'menu');
});
