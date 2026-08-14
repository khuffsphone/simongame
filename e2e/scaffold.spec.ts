import { expect, test } from '@playwright/test';

test('the built single-file artifact boots with no network requests', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url === `${test.info().project.use.baseURL}/` || url.endsWith('/index.html')) return;
    if (url.startsWith('data:') || url.startsWith('blob:')) return;
    external.push(`${request.method()} ${url}`);
  });

  await page.goto('/');

  await expect(page.locator('.app')).toHaveAttribute('data-screen', 'splash');
  await expect(page.getByTestId('splash-play')).toBeVisible();
  expect(external, 'artifact must issue zero subresource requests').toEqual([]);
});

test('the menu scrolls on a short viewport so Start is always reachable', async ({ page }) => {
  // A 568px-tall phone with eight mode cards: the reference builds pinned
  // body overflow hidden here and buried the Start button.
  await page.setViewportSize({ width: 320, height: 480 });
  await page.goto('/');
  await page.getByTestId('splash-play').click();

  const start = page.getByTestId('menu-start');
  await start.scrollIntoViewIfNeeded();
  await expect(start).toBeInViewport();
  await start.click();
  await expect(page.locator('.app')).toHaveAttribute('data-screen', 'game');
});
