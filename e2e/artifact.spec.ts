import { expect, test } from '@playwright/test';
import { ARTIFACT_URL } from '../playwright.config';
import { installSequenceObserver, presented, startRun, tapPads, waitForCapture } from './helpers';

// `scripts/make-artifact.mjs` strips the outer document tags so the bundle can
// be published to a host that supplies its own skeleton. That transform is only
// safe if the result still plays, so it gets the same treatment as dist/:
// loaded in a real browser and played through a level.

test.beforeEach(async ({ page }) => {
  await installSequenceObserver(page);
  await page.goto(ARTIFACT_URL);
});

test('the repackaged bundle boots and makes no network requests', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url === ARTIFACT_URL || url.endsWith('/index.html')) return;
    if (url.startsWith('data:') || url.startsWith('blob:')) return;
    external.push(`${request.method()} ${url}`);
  });

  await page.reload();

  await expect(page.locator('.app')).toHaveAttribute('data-screen', 'splash');
  expect(external).toEqual([]);
});

test('the repackaged bundle plays a level end to end', async ({ page }) => {
  await startRun(page, { mode: 'color' });
  await waitForCapture(page, 3);
  await tapPads(page, await presented(page));
  await expect(page.getByTestId('hud-level')).toHaveText('2');
});

test('the board stays square and on-screen in a desktop-sized frame', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await startRun(page, { mode: 'color' });

  const grid = page.locator('.grid[data-active="true"]');
  const box = (await grid.boundingBox())!;
  expect(Math.abs(box.width - box.height)).toBeLessThan(2);
  expect(box.height).toBeLessThanOrEqual(720);
});
