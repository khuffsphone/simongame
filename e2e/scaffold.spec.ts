import { expect, test } from '@playwright/test';

// Phase A scaffold e2e. The gameplay specs required by Phase A step 4
// (tap-to-start audio unlock, level 1 completion, backgrounding/resume,
// second-backgrounding run end) land with the engine port — they cannot be
// written against a contract that does not exist yet.

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

  await expect(page.locator('html')).toHaveAttribute('data-app-booted', 'true');
  await expect(page.getByTestId('boot-status')).toBeVisible();
  expect(external, 'artifact must issue zero subresource requests').toEqual([]);
});
