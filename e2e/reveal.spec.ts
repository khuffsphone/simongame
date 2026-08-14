import { expect, test } from '@playwright/test';
import { installSequenceObserver, startRun, waitForAnyCapture } from './helpers';

// CANON §6 / decisions/0020. The unit tests pin the wording; these prove a
// player who actually loses a run actually reads it.

test.beforeEach(async ({ page }) => {
  await installSequenceObserver(page);
  await page.goto('/');
});

const COLOR_NAMES = ['Green', 'Red', 'Yellow', 'Blue'];

test('losing a colour run reveals which pad it was', async ({ page }) => {
  await startRun(page, { mode: 'color' });
  const sequence = await waitForAnyCapture(page);
  const answer = Number(sequence[0]);

  // Tap any pad but the right one.
  const wrong = (answer + 1) % 4;
  await page.locator(`.grid--color[data-active="true"] .grid__pad[data-value="${wrong}"]`).click();

  await expect(page.getByTestId('overlay')).toHaveAttribute('data-open', 'true', {
    timeout: 5000,
  });
  const body = page.getByTestId('overlay-body');
  await expect(body).toContainText(`The answer was ${COLOR_NAMES[answer]}.`);
  await expect(body).toContainText(`You gave ${COLOR_NAMES[wrong]}.`);
  await expect(body).toContainText('You reached level 1.');
});

test('the reveal names the pad, not its index', async ({ page }) => {
  await startRun(page, { mode: 'number' });
  const sequence = await waitForAnyCapture(page);
  const answer = Number(sequence[0]);
  const wrong = (answer + 2) % 4;
  await page.locator(`.grid--number[data-active="true"] .grid__pad[data-value="${wrong}"]`).click();

  const body = page.getByTestId('overlay-body');
  await expect(body).toContainText(`The answer was ${answer + 1}.`, { timeout: 5000 });
});

test('timing out reveals the answer without claiming the player gave one', async ({ page }) => {
  await startRun(page, { mode: 'color', difficulty: 'hard' });
  await waitForAnyCapture(page);

  // Do nothing. Hard shortens the 3000 ms colour timeout to 2550 ms.
  const body = page.getByTestId('overlay-body');
  await expect(body).toContainText('Out of time.', { timeout: 8000 });
  await expect(body).toContainText('The answer was');
  await expect(body).not.toContainText('You gave');
});

test('the run-over overlay never says only "Wrong step."', async ({ page }) => {
  // The regression guard for the defect itself.
  await startRun(page, { mode: 'shape' });
  const sequence = await waitForAnyCapture(page);
  const wrong = (Number(sequence[0]) + 1) % 4;
  await page.locator(`.grid--shape[data-active="true"] .grid__pad[data-value="${wrong}"]`).click();

  await expect(page.getByTestId('overlay-title')).toHaveText('RUN OVER', { timeout: 5000 });
  await expect(page.getByTestId('overlay-body')).toContainText('The answer was');
});
