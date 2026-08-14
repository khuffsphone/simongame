import { expect, test } from '@playwright/test';
import {
  armedTransitions,
  glyphs,
  installSequenceObserver,
  presented,
  startRun,
  tapPads,
  waitForCapture,
} from './helpers';

// One spec per modality that needs proving as *real gameplay*, not decoration.

test.beforeEach(async ({ page }) => {
  await installSequenceObserver(page);
  await page.goto('/');
});

test('mode selection is reflected in the HUD', async ({ page }) => {
  await startRun(page, { mode: 'shape' });
  await expect(page.getByTestId('hud-mode')).toHaveText('Shape');
  await expect(page.locator('.grid--shape[data-active="true"]')).toBeVisible();
});

test('difficulty selection reaches the run', async ({ page }) => {
  await page.getByTestId('splash-play').click();
  await page.getByTestId('difficulty-hard').click();
  await expect(page.getByTestId('difficulty-hard')).toHaveAttribute('data-selected', 'true');
  await expect(page.getByTestId('difficulty-normal')).toHaveAttribute('data-selected', 'false');
  await page.getByTestId('menu-start').click();
  await expect(page.getByTestId('seed')).toContainText('hard');
});

test('sound presentation never reveals which pad is playing', async ({ page }) => {
  await startRun(page, { mode: 'sound' });
  await page.waitForFunction(() => window.__presented.length >= 1, undefined, { timeout: 30_000 });

  // The grid pulses as a whole; no individual pad is marked as presenting.
  await expect(page.locator('.grid--sound[data-listening="true"]')).toBeVisible();
  expect(await page.locator('.grid--sound .grid__pad[data-presenting="true"]').count()).toBe(0);
});

test('shape level 1 is completable', async ({ page }) => {
  await startRun(page, { mode: 'shape' });
  await waitForCapture(page, 3);
  await tapPads(page, await presented(page));
  await expect(page.getByTestId('hud-level')).toHaveText('2');
});

test('trace is real gameplay: the glyph is hidden, then redrawn from memory', async ({ page }) => {
  await startRun(page, { mode: 'trace', difficulty: 'easy' });

  // Wait for the glyph to be shown, and grab the geometry it displayed.
  await page.waitForFunction(() => window.__glyphs.length >= 1, undefined, { timeout: 30_000 });
  const shown = (await glyphs(page))[0]!;
  expect(shown.length).toBeGreaterThan(0);

  await waitForCapture(page, 3);

  // Once capture opens the template must be gone — it is a memory game.
  await expect(page.locator('.trace__expected')).toHaveAttribute('points', '');

  const pad = page.locator('.trace__pad');
  const box = (await pad.boundingBox())!;

  // Replay the glyph that was shown, in viewBox units, as a real stroke.
  const points = shown
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [x, y] = pair.split(',').map(Number);
      return { x: box.x + (x! / 100) * box.width, y: box.y + (y! / 100) * box.height };
    });

  await page.mouse.move(points[0]!.x, points[0]!.y);
  await page.mouse.down();
  for (const point of points.slice(1)) {
    // 12 steps per segment, not 6: the `line` glyph is only two points, and at
    // 6 steps the whole stroke is 7 samples — one under the 8-sample stray-tap
    // guard, so a perfect trace was rejected. Dense enough for every glyph.
    await page.mouse.move(point.x, point.y, { steps: 12 });
  }
  await page.mouse.up();

  // A faithful redraw scores a pass, so the run does not end here.
  await expect(page.locator('.app')).not.toHaveAttribute('data-state', 'FAIL');
  await expect(page.getByTestId('hud-combo')).not.toHaveText('0');
});

test('rhythm capture ends on silence, not on a fixed tap count', async ({ page }) => {
  await startRun(page, { mode: 'rhythm', difficulty: 'easy' });
  await waitForCapture(page, 1);

  const before = (await armedTransitions(page)).length;
  const pad = page.locator('.rhythm__pad');
  // Four taps for a three-interval pattern. A fixed-count terminator set to
  // three intervals would have closed capture before the fourth landed.
  for (let i = 0; i < 4; i += 1) {
    await pad.click();
    await page.waitForTimeout(280);
  }

  // Capture closes on silence — no fifth tap is given, and the step still ends.
  await page.waitForFunction(
    (n) => window.__armed.slice(n).includes('false'),
    before,
    { timeout: 8000 },
  );
  const after = (await armedTransitions(page)).slice(before);
  expect(after).toContain('false');
});
