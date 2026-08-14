import { expect, test } from '@playwright/test';

// Regression cover for decisions/0010: chrome bound to pointerdown alone is a
// silent no-op for keyboard, assistive tech, and synthetic clicks. Every entry
// point into the game is pinned here.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.app')).toHaveAttribute('data-screen', 'splash');
});

const reachMenu = 'data-screen';

test('splash starts on tap', async ({ page }) => {
  await page.getByTestId('splash-play').tap();
  await expect(page.locator('.app')).toHaveAttribute(reachMenu, 'menu');
});

test('splash starts on mouse click', async ({ page }) => {
  await page.getByTestId('splash-play').click();
  await expect(page.locator('.app')).toHaveAttribute(reachMenu, 'menu');
});

test('splash starts on keyboard Enter', async ({ page }) => {
  await page.getByTestId('splash-play').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.app')).toHaveAttribute(reachMenu, 'menu');
});

test('splash starts on keyboard Space', async ({ page }) => {
  await page.getByTestId('splash-play').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('.app')).toHaveAttribute(reachMenu, 'menu');
});

test('splash starts on a synthetic click, as assistive tech dispatches it', async ({ page }) => {
  await page.getByTestId('splash-play').dispatchEvent('click');
  await expect(page.locator('.app')).toHaveAttribute(reachMenu, 'menu');
});

test('the whole menu is keyboard operable', async ({ page }) => {
  await page.getByTestId('splash-play').click();
  await expect(page.locator('.app')).toHaveAttribute(reachMenu, 'menu');

  await page.getByTestId('mode-number').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('mode-number')).toHaveAttribute('data-selected', 'true');

  await page.getByTestId('difficulty-easy').focus();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('difficulty-easy')).toHaveAttribute('data-selected', 'true');

  await page.getByTestId('menu-start').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.app')).toHaveAttribute(reachMenu, 'game');
  await expect(page.getByTestId('hud-mode')).toHaveText('Number');
});

test('a real tap does not double-fire into a second screen transition', async ({ page }) => {
  await page.getByTestId('splash-play').tap();
  await expect(page.locator('.app')).toHaveAttribute(reachMenu, 'menu');
  await page.getByTestId('mode-shape').tap();
  // The ghost click that trails a tap must not toggle anything a second time.
  await expect(page.getByTestId('mode-shape')).toHaveAttribute('data-selected', 'true');
  await expect(page.getByTestId('mode-classic')).toHaveAttribute('data-selected', 'false');
});

test('interactive targets meet the 44px minimum (CANON §8)', async ({ page }) => {
  const play = page.getByTestId('splash-play');
  const playBox = (await play.boundingBox())!;
  expect(playBox.width).toBeGreaterThanOrEqual(44);
  expect(playBox.height).toBeGreaterThanOrEqual(44);

  await play.click();
  for (const id of ['mode-classic', 'mode-marathon', 'difficulty-easy', 'menu-start']) {
    const box = (await page.getByTestId(id).boundingBox())!;
    expect(box.height, `${id} height`).toBeGreaterThanOrEqual(44);
    expect(box.width, `${id} width`).toBeGreaterThanOrEqual(44);
  }

  await page.getByTestId('menu-start').click();
  const pads = page.locator('.grid[data-active="true"] .grid__pad');
  await expect(pads).toHaveCount(4);
  for (let i = 0; i < 4; i += 1) {
    const box = (await pads.nth(i).boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});
