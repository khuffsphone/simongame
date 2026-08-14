/**
 * Example phases file for measure-frames.mjs (MODESHIFT).
 *
 * Name phases after moments the player actually experiences — and make sure at
 * least one of them has the expensive thing ON SCREEN.
 *
 * The trap this file exists to avoid: an idle screen is free at any throttle.
 * If the FX loop stops when nothing is visible (which it should), measuring
 * "splash idle" at 4x and again at 8x returns the same number both times, and
 * that number says nothing about headroom. It only proves the idle path is
 * genuinely idle. The phases that carry information are the ones with particles
 * live and the ones transitioning out of a celebration into play.
 */

/** Reproduce the presented sequence so the run can reach a level-up. */
async function installObserver(page) {
  await page.evaluate(() => {
    window.__seq = [];
    new MutationObserver((records) => {
      for (const r of records) {
        const t = r.target;
        if (r.attributeName === 'data-step-value' && t.dataset?.stepValue !== undefined) {
          window.__seq.push(t.dataset.stepValue);
        }
      }
    }).observe(document, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-step-value'],
    });
  });
}

async function clearLevelOne(page) {
  await page.waitForFunction(() => window.__seq.length >= 3, undefined, { timeout: 30_000 });
  await page.locator('[data-armed="true"]').first().waitFor({ timeout: 30_000 });
  const sequence = await page.evaluate(() => [...window.__seq]);
  for (const value of sequence) {
    await page.locator(`.grid[data-active="true"] .grid__pad[data-value="${value}"]`).click();
  }
}

export default [
  { name: 'splash idle', ms: 2000 },
  {
    name: 'menu',
    ms: 2000,
    run: async (page) => {
      await installObserver(page);
      await page.getByTestId('splash-play').click();
      await page.waitForSelector('[data-screen="menu"]');
    },
  },
  {
    name: 'presenting',
    ms: 3000,
    run: async (page) => {
      await page.getByTestId('mode-color').click();
      await page.getByTestId('menu-start').click();
      await page.waitForSelector('[data-screen="game"]');
    },
  },
  {
    // The one that matters: full jackpot with particles live.
    //
    // The window is 900 ms, and that number is measured, not chosen. Probing
    // the FX canvas for non-transparent pixels through this phase shows
    // particles alive from 40 ms to 512 ms after the level clears, and dead
    // for the rest. This phase used to sample 3500 ms — so ~85% of the frames
    // in it were idle frames, p95 sat on an idle frame, and the statistic
    // reported 16.7 ms no matter what the burst cost. It passed at 8x for the
    // same reason "splash idle" passes at 8x.
    //
    // A percentile is only about the thing you are measuring if the thing you
    // are measuring fills the window. Size the window to the effect, or read
    // `worst` instead of `p95` and accept a noisier number.
    name: 'jackpot (particles live)',
    ms: 900,
    run: async (page) => {
      await clearLevelOne(page);
    },
  },
  {
    // The tail: particles dead, next sequence presenting. Cheap by design, and
    // here so a regression that leaves the FX loop running has somewhere to
    // show up.
    name: 'post-jackpot recovery',
    ms: 2000,
  },
];
