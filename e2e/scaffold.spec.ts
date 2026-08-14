import { expect, test } from '@playwright/test';

test('the built single-file artifact boots with no network requests', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    // The document itself is the only request the page is allowed to make.
    if (url === `${test.info().project.use.baseURL}/` || url.endsWith('/index.html')) return;
    if (url.startsWith('data:') || url.startsWith('blob:')) return;
    external.push(`${request.method()} ${url}`);
  });

  await page.goto('/');

  await expect(page.locator('#app')).toHaveAttribute('data-state', 'BOOT');
  await expect(page.getByTestId('overlay-action')).toBeVisible();
  expect(external, 'artifact must issue zero subresource requests').toEqual([]);
});

test('interactive targets meet the 44px minimum (CANON §8)', async ({ page }) => {
  await page.goto('/');

  const startButton = page.getByTestId('overlay-action');
  const startBox = await startButton.boundingBox();
  expect(startBox!.width).toBeGreaterThanOrEqual(44);
  expect(startBox!.height).toBeGreaterThanOrEqual(44);

  await startButton.tap();
  await expect(page.locator('#app')).toHaveAttribute('data-state', 'PRESENTING');

  const pads = page.locator('.grid[data-active="true"] .grid__pad');
  await expect(pads).toHaveCount(4);
  for (let i = 0; i < 4; i += 1) {
    const box = await pads.nth(i).boundingBox();
    expect(box!.width, `pad ${i} width`).toBeGreaterThanOrEqual(44);
    expect(box!.height, `pad ${i} height`).toBeGreaterThanOrEqual(44);
  }
});
