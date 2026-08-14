import { expect, test } from '@playwright/test';

// Regression cover for decisions/0010. The start button was bound to
// pointerdown alone, which made it a silent no-op for every activation path
// that does not produce a pointer event. All four are pinned here.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'BOOT');
});

test('starts on tap', async ({ page }) => {
  await page.getByTestId('overlay-action').tap();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'PRESENTING');
});

test('starts on mouse click', async ({ page }) => {
  await page.getByTestId('overlay-action').click();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'PRESENTING');
});

test('starts on keyboard Enter', async ({ page }) => {
  await page.getByTestId('overlay-action').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'PRESENTING');
});

test('starts on keyboard Space', async ({ page }) => {
  await page.getByTestId('overlay-action').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'PRESENTING');
});

test('starts on a synthetic click, as assistive tech dispatches it', async ({ page }) => {
  await page.getByTestId('overlay-action').dispatchEvent('click');
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'PRESENTING');
});

test('the start button is reachable by keyboard', async ({ page }) => {
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('overlay-action')).toBeFocused();
});

test('a real tap does not double-fire into a second run', async ({ page }) => {
  // pointerdown starts the run; the click that trails it must be ignored,
  // otherwise the level restarts under the player.
  const levels: string[] = [];
  await page.getByTestId('overlay-action').tap();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'PRESENTING');

  for (let i = 0; i < 6; i += 1) {
    levels.push((await page.getByTestId('hud-step').textContent()) ?? '');
    await page.waitForTimeout(120);
  }

  // Step counter only ever moves forward within the level.
  const indices = levels.map((text) => Number(text.split('/')[0]!.trim()));
  for (let i = 1; i < indices.length; i += 1) {
    expect(indices[i]!).toBeGreaterThanOrEqual(indices[i - 1]!);
  }
});
