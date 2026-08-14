import { expect, test, type Page } from '@playwright/test';
import { startRun } from './helpers';

// CANON §4b / decisions/0019. The unit tests prove the arithmetic; these prove
// the record survives a page load, reaches the engine, and is disclosed to the
// player in the shipped UI.

interface ModalityRecord {
  attempts: number;
  passes: number;
  accuracyTotal: number;
}

/** Seed the real save slot before the app boots, as a returning player would. */
async function seedRecord(
  page: Page,
  modalityAccuracy: Record<string, ModalityRecord>,
): Promise<void> {
  await page.addInitScript((accuracy) => {
    localStorage.setItem(
      'modeshift:v2',
      JSON.stringify({
        version: 2,
        bestLevel: 4,
        bestByMode: {},
        lastSeed: null,
        modalityAccuracy: accuracy,
      }),
    );
  }, modalityAccuracy);
}

test('a struggling record is disclosed by name, not applied silently', async ({ page }) => {
  await seedRecord(page, { shape: { attempts: 40, passes: 2, accuracyTotal: 2 } });
  await page.goto('/');
  await startRun(page, { mode: 'shape' });

  await expect(page.getByTestId('seed')).toContainText('assist: Shape');
  await expect(page.locator('.app')).toHaveAttribute('data-adaptive', 'true');
});

test('a competent record adapts nothing and claims nothing', async ({ page }) => {
  await seedRecord(page, { shape: { attempts: 40, passes: 30, accuracyTotal: 30 } });
  await page.goto('/');
  await startRun(page, { mode: 'shape' });

  await expect(page.getByTestId('seed')).not.toContainText('assist');
  await expect(page.locator('.app')).toHaveAttribute('data-adaptive', 'false');
});

test('a solved record tightens the pace without claiming to be an assist', async ({ page }) => {
  // Scale is below 1, so the player is being pressured, not helped. Labelling
  // that as an "assist" would be a lie; labelling nothing at all is correct.
  await seedRecord(page, { shape: { attempts: 40, passes: 40, accuracyTotal: 40 } });
  await page.goto('/');
  await startRun(page, { mode: 'shape' });

  await expect(page.getByTestId('seed')).not.toContainText('assist');
  await expect(page.locator('.app')).toHaveAttribute('data-adaptive', 'false');
});

test('a record below the attempt minimum moves nothing', async ({ page }) => {
  await seedRecord(page, { shape: { attempts: 5, passes: 0, accuracyTotal: 0 } });
  await page.goto('/');
  await startRun(page, { mode: 'shape' });

  await expect(page.locator('.app')).toHaveAttribute('data-adaptive', 'false');
});

test('the assist survives a reload, because the record does', async ({ page }) => {
  await seedRecord(page, { trace: { attempts: 40, passes: 0, accuracyTotal: 0 } });
  await page.goto('/');
  await startRun(page, { mode: 'trace' });
  await expect(page.getByTestId('seed')).toContainText('assist: Trace');

  await page.reload();
  await startRun(page, { mode: 'trace' });
  await expect(page.getByTestId('seed')).toContainText('assist: Trace');
});
