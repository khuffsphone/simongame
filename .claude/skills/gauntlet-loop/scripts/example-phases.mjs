/**
 * Example phases file for measure-frames.mjs (MODESHIFT).
 *
 * Name the phases after moments the player actually experiences. The one that
 * matters most is the transition OUT of a celebration into the next round of
 * play — that is where the worst frames land on the beats the player most needs
 * to see, and it is the phase people forget to measure.
 */
export default [
  { name: 'splash idle', ms: 2000 },
  {
    name: 'menu',
    ms: 2000,
    run: async (page) => {
      await page.getByTestId('splash-play').click();
      await page.waitForSelector('[data-screen="menu"]');
    },
  },
  {
    name: 'presenting',
    ms: 3000,
    run: async (page) => {
      await page.getByTestId('menu-start').click();
      await page.waitForSelector('[data-screen="game"]');
    },
  },
  { name: 'capture', ms: 3000 },
];
