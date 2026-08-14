import { expect, test } from '@playwright/test';
import {
  installAudioProbe,
  installSequenceObserver,
  presentedValues,
  setHidden,
  tapSequence,
  waitForCapture,
} from './helpers';

// Phase A e2e — CANON §13. These run against the built single-file artifact on
// a Pixel 5 viewport, headless.

const LEVEL_1_STEPS = 3;

test.beforeEach(async ({ page }) => {
  await installAudioProbe(page);
  await installSequenceObserver(page);
  await page.goto('/');
});

test('tap-to-start unlocks audio, and nothing is constructed before the gesture', async ({
  page,
}) => {
  // CANON §9: no AudioContext exists until the first user gesture.
  expect(await page.evaluate(() => window.__audioProbe.constructed)).toBe(0);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'BOOT');

  await page.getByTestId('overlay-action').tap();

  await expect(page.locator('#app')).toHaveAttribute('data-state', 'PRESENTING');
  expect(await page.evaluate(() => window.__audioProbe.constructed)).toBe(1);
  expect(await page.evaluate(() => window.__audioProbe.state())).toBe('running');

  // The engine refuses PRESENTING unless the context is running, so reaching
  // PRESENTING is itself proof the gate held.
  await expect(page.getByTestId('overlay')).toHaveAttribute('data-open', 'false');
});

test('level 1 completes and the run advances to level 2', async ({ page }) => {
  await page.getByTestId('overlay-action').tap();
  await waitForCapture(page, LEVEL_1_STEPS);

  const sequence = await presentedValues(page);
  expect(sequence).toHaveLength(LEVEL_1_STEPS);

  await tapSequence(page, sequence);

  await expect(page.getByTestId('hud-level')).toHaveText('2');
  await expect(page.getByTestId('overlay')).toHaveAttribute('data-open', 'false');
});

test('backgrounding mid-capture pauses, and resuming replays with no phantom timeout', async ({
  page,
}) => {
  await page.getByTestId('overlay-action').tap();
  await waitForCapture(page, LEVEL_1_STEPS);
  const firstPass = await presentedValues(page);

  await setHidden(page, true);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'PAUSED');
  await expect(page.getByTestId('overlay-title')).toHaveText('Paused');
  await expect(page.getByTestId('hud-replays')).toHaveText('1');

  // The capture timeout armed before the pause was 3000 ms. Sit well past it:
  // if any timer survived the abort, the run would die here.
  await page.waitForTimeout(4500);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'PAUSED');

  await setHidden(page, false);

  // The replay re-presents the same sequence rather than generating a new one.
  await waitForCapture(page, LEVEL_1_STEPS * 2);
  const afterReplay = await presentedValues(page);
  expect(afterReplay.slice(LEVEL_1_STEPS, LEVEL_1_STEPS * 2)).toEqual(firstPass);
  await expect(page.getByTestId('hud-replays')).toHaveText('0');

  await tapSequence(page, firstPass);
  await expect(page.getByTestId('hud-level')).toHaveText('2');
});

test('a second backgrounding ends the run', async ({ page }) => {
  await page.getByTestId('overlay-action').tap();
  await waitForCapture(page, LEVEL_1_STEPS);

  await setHidden(page, true);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'PAUSED');

  await setHidden(page, false);
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'PRESENTING');
  await expect(page.getByTestId('hud-replays')).toHaveText('0');

  await setHidden(page, true);

  await expect(page.locator('#app')).toHaveAttribute('data-state', 'FAIL');
  await expect(page.getByTestId('overlay-title')).toHaveText('Run over');
  await expect(page.getByTestId('overlay-body')).toContainText('You left the game twice.');
});

test('a wrong tap ends the run immediately (0 lives)', async ({ page }) => {
  await page.getByTestId('overlay-action').tap();
  await waitForCapture(page, LEVEL_1_STEPS);

  const sequence = await presentedValues(page);
  const wrong = (sequence[0]! + 1) % 4;
  await tapSequence(page, [wrong]);

  await expect(page.locator('#app')).toHaveAttribute('data-state', 'FAIL');
  await expect(page.getByTestId('overlay-body')).toContainText('Wrong step.');
  await expect(page.getByTestId('overlay-body')).toContainText('level 1');
});
