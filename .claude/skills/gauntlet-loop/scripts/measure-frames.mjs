#!/usr/bin/env node
/**
 * Frame-budget gate.
 *
 * Drives an app through named phases under CDP CPU throttling on a mobile
 * viewport, samples requestAnimationFrame deltas, and exits non-zero when any
 * phase blows its budget. This is what turns "feels slow" into a number that
 * can fail a build.
 *
 *   node measure-frames.mjs --url http://127.0.0.1:4173 \
 *                           --phases ./frame-phases.mjs \
 *                           --throttle 4 --budget 20
 *
 * The phases file default-exports an array of:
 *   { name: string, ms?: number, run?: async (page) => void }
 * `run` drives the app into the state being measured; sampling then covers the
 * following `ms` (default 2000). Without a phases file the script measures a
 * single idle phase after load, which is enough to catch an always-on
 * animation loop but not much else.
 *
 * Absolute numbers under headless software rendering are pessimistic — real
 * devices composite on the GPU. Treat the budget as a regression tripwire and a
 * relative ranking between phases, not as a device FPS prediction.
 *
 * Watch for the vsync ceiling: a phase reporting a flat 16.7 ms is pinned at
 * 60 fps and the measurement cannot tell you how much headroom is left beneath
 * it. A build with vast spare capacity and one that is one effect away from
 * dropping frames look identical. Re-run at a harsher throttle (8x) to find the
 * real margin — that is the number that tells you how much polish you can
 * afford.
 */
import { chromium } from '@playwright/test';

function parseArgs(argv) {
  const args = {
    url: 'http://127.0.0.1:4173',
    phases: null,
    throttle: 4,
    budget: 20,
    width: 390,
    height: 844,
    dpr: 2,
    json: null,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const [flag, inline] = argv[i].split('=');
    const value = inline ?? argv[++i];
    const key = flag.replace(/^--/, '');
    if (!(key in args)) throw new Error(`Unknown flag ${flag}`);
    args[key] = ['throttle', 'budget', 'width', 'height', 'dpr'].includes(key)
      ? Number(value)
      : value;
  }
  return args;
}

const percentile = (sorted, p) =>
  sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

/** Records rAF deltas into the page. Reinstalled per phase so samples are clean. */
async function startSampling(page) {
  await page.evaluate(() => {
    window.__frameDeltas = [];
    let last = 0;
    const tick = (t) => {
      if (last) window.__frameDeltas.push(t - last);
      last = t;
      window.__frameHandle = requestAnimationFrame(tick);
    };
    window.__frameHandle = requestAnimationFrame(tick);
  });
}

async function stopSampling(page) {
  return page.evaluate(() => {
    cancelAnimationFrame(window.__frameHandle);
    return window.__frameDeltas.slice();
  });
}

async function main() {
  const args = parseArgs(process.argv);

  let phases = [{ name: 'idle', ms: 2000 }];
  if (args.phases) {
    const mod = await import(new URL(args.phases, `file://${process.cwd()}/`).href);
    phases = mod.default ?? mod.phases;
    if (!Array.isArray(phases)) throw new Error('phases file must export an array');
  }

  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  });
  const context = await browser.newContext({
    viewport: { width: args.width, height: args.height },
    deviceScaleFactor: args.dpr,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();

  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: args.throttle });

  const results = [];
  let failed = false;

  await page.goto(args.url, { waitUntil: 'load' });

  for (const phase of phases) {
    if (phase.run) await phase.run(page);
    await startSampling(page);
    await page.waitForTimeout(phase.ms ?? 2000);
    const deltas = await stopSampling(page);

    const sorted = [...deltas].sort((a, b) => a - b);
    const mean = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0;
    const p95 = percentile(sorted, 0.95);
    const worst = sorted[sorted.length - 1] ?? 0;
    const budget = phase.budget ?? args.budget;
    const pass = p95 <= budget && deltas.length > 0;
    if (!pass) failed = true;

    results.push({
      phase: phase.name,
      frames: deltas.length,
      meanMs: +mean.toFixed(1),
      p95Ms: +p95.toFixed(1),
      worstMs: +worst.toFixed(1),
      approxFps: mean ? +(1000 / mean).toFixed(1) : 0,
      budgetMs: budget,
      pass,
    });
  }

  await browser.close();

  const pad = (s, n) => String(s).padEnd(n);
  console.log(
    `\nframe budget @ ${args.throttle}x CPU throttle, ${args.width}x${args.height} DPR${args.dpr}\n`,
  );
  console.log(
    `  ${pad('phase', 26)}${pad('frames', 8)}${pad('mean', 8)}${pad('p95', 8)}${pad('worst', 8)}${pad('~fps', 7)}result`,
  );
  for (const r of results) {
    console.log(
      `  ${pad(r.phase, 26)}${pad(r.frames, 8)}${pad(r.meanMs + 'ms', 8)}${pad(r.p95Ms + 'ms', 8)}` +
        `${pad(r.worstMs + 'ms', 8)}${pad(r.approxFps, 7)}${r.pass ? 'PASS' : `FAIL (> ${r.budgetMs}ms)`}`,
    );
  }

  if (args.json) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(args.json, JSON.stringify({ config: args, results }, null, 2));
    console.log(`\nwrote ${args.json}`);
  }

  if (results.some((r) => r.frames === 0)) {
    console.error('\nA phase recorded zero frames — the page may not have loaded or rAF is idle.');
  }
  console.log(failed ? '\nframe budget: FAILED\n' : '\nframe budget: OK\n');
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
