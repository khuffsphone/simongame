# MODESHIFT

A mobile-first Simon Says game whose challenge modality rotates between colour,
number, shape, sound, and traced path.

**Phase A is complete.** Levels 1–2 are playable end to end; the engine FSM,
seeded RNG, registry, data-driven schedule, and the colour and number modalities
are in. See [`docs/PHASE-A-REPORT.md`](docs/PHASE-A-REPORT.md).

## Ground rules

- [`CANON.md`](CANON.md) is the single source of truth. If code and CANON
  disagree, one of them is a bug — name which one; do not silently reconcile.
- Nothing is reported as working unless it has been run. Anything unverifiable
  in the current environment is called out and marked UNVERIFIED.
- Any deviation from CANON, and any resolution of an underspecified item, gets
  an ADR in [`decisions/`](decisions/).

## Shipping constraint

The build emits **one self-contained `dist/index.html`**: JS and CSS inlined,
no CDN, no external assets, zero network requests at runtime. All audio is
synthesized via Web Audio; all art is CSS/SVG/Canvas.
`scripts/assert-selfcontained.mjs` runs as the last step of every build and
fails it if that stops being true. The guard has its own test suite
(`tests/build-guard.test.ts`) so it cannot rot into a no-op.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck → build → assert the artifact is self-contained |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit + integration + leak suites |
| `npx playwright test` | e2e against the **built** artifact, mobile viewport, headless |
| `npm run verify` | Build, unit tests, and e2e in one pass |

`?seed=<value>` pins a deterministic run for repro; it survives a fail and
restart. A bare integer is the seed itself, anything else hashes via FNV-1a.

### Playwright in a sandboxed container

If the image ships a Chromium whose build number does not match this Playwright
version, point at it instead of downloading:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test
```

Unset, Playwright resolves its own managed browser, so CI needs no special
handling.

## Layout

```
CANON.md          single source of truth
decisions/        ADRs — one per resolved ambiguity or deviation
src/core/         engine FSM, RNG, clock, abort ownership, registry, schedule, audio
src/modalities/   the plugins; adding one costs a file plus a registry line
src/ui/           app shell, HUD, overlay, the start gesture
tests/            Vitest: unit, integration (fake timers), leak
e2e/              Playwright specs, run against dist/index.html
scripts/          build assertions
docs/             phase reports
```

## Adding a modality

Implement the contract in `CANON.md` §3 in a new file under `src/modalities/`,
then add one line to `createDefaultRegistry()` in `src/modalities/index.ts`.
Nothing in `src/core/` should need to change — Phase C proves that by adding a
sixth modality and checking the diff.
