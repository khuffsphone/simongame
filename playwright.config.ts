import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

// Sandboxes and CI images often ship a prebuilt Chromium that does not match the
// browser revision this Playwright version would download. Point
// PLAYWRIGHT_CHROMIUM_EXECUTABLE at that binary to reuse it; unset, Playwright
// resolves its own managed browser as usual.
const chromiumPath = process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE'];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 5'],
        ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
      },
    },
  ],
  // Serves the built single-file artifact, so e2e exercises what actually ships.
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
