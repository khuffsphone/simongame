# MODESHIFT

A mobile-first Simon Says game whose challenge modality rotates between colour,
number, shape, sound, and traced path.

> **Phase A is blocked at step 1.** The legacy prototype
> (`./legacy/index.html`) that CANON.md must be extracted from is not in this
> repository, so `CANON.md` has not been written and no engine code exists yet.
> See [`docs/PHASE-A-STATUS.md`](docs/PHASE-A-STATUS.md) for exactly what is
> done, what was run to verify it, and what is outstanding.

## Ground rules

- `CANON.md` is the single source of truth. If code and CANON disagree, one of
  them is a bug — name which one; do not silently reconcile.
- Nothing is reported as working unless it has been run. Anything that cannot
  be verified in the current environment is called out and marked UNVERIFIED.
- Any deviation from CANON gets an ADR in `./decisions/` before the code.

## Shipping constraint

The build emits **one self-contained `dist/index.html`**: JS and CSS inlined,
zero network requests, zero external assets. `scripts/assert-selfcontained.mjs`
runs as the last step of every build and fails it if that stops being true. The
guard has its own test suite (`tests/build-guard.test.ts`) so it cannot rot into
a no-op.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck → build → assert the artifact is self-contained |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit + integration suite |
| `npx playwright test` | e2e against the **built** artifact, mobile viewport, headless |
| `npm run verify` | Build, unit tests, and e2e in one pass |

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
src/            engine + modality modules (Phase A step 3 — not yet ported)
tests/          Vitest unit + integration suites
e2e/            Playwright specs, run against dist/index.html
scripts/        build assertions
docs/           status reports
decisions/      ADRs for any deviation from CANON.md
legacy/         the prior single-file prototype (MISSING — see status doc)
```
