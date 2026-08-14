# Phase A — status

Phase A is **blocked at step 1**. Steps 2 (scaffold) and the build guard are
done and verified; steps 1, 3, 4 and 5 cannot start.

## Blocker: `./legacy/index.html` is not present

The brief says the prior single-file prototype is "attached / at
`./legacy/index.html`". It is not in the repository and not on disk. The
repository had **zero commits** when this work started, and a filesystem sweep
for any `.html` or `*legacy*` file outside tooling caches found nothing.

Everything Phase A step 1 asks CANON.md to capture is derived from that file:

| CANON.md section | Status | Source |
| --- | --- | --- |
| FSM states | **UNKNOWN** | legacy only |
| Modality contract (`mount()`, services, lifecycle) | **UNKNOWN** | legacy only |
| `stepsForLevel(n)` | **KNOWN** | `n <= 5 ? n + 2 : floor(n * 1.25) + 3` — given in the brief |
| Level schedule (which modality at which level) | **UNKNOWN** | legacy only |
| Abort/recovery policy | **PARTIAL** | brief gives "one focus-lost replay per run, one pointercancel retry per level"; the surrounding state transitions are legacy only |
| Timing model (presentation cadence, capture windows, timeouts) | **UNKNOWN** | legacy only |
| Seeded LCG (multiplier, increment, modulus, seeding) | **UNKNOWN** | legacy only |
| `scoreStep` per modality | **PARTIAL** | brief gives the trace tolerance edge at `0.85`; the five scoring rules are legacy only |

A *parity port* is defined by the thing it must reach parity with. Writing
CANON.md from the eight known facts above would mean inventing the other
thirty — and a partial CANON.md is worse than none, because CANON is declared
the single source of truth, so today's guesses become tomorrow's canon and
every later disagreement between code and CANON gets adjudicated against
fiction. Per the ground rules ("flag anything ambiguous instead of inventing
it"), CANON.md is deliberately **not** written yet.

**To unblock:** add the prototype at `./legacy/index.html` (commit it, or paste
its contents). CANON.md, the engine port, and the Phase A test suite follow
from it.

## Done and verified

Every claim below was produced by running the command shown, in this
environment, on this commit.

### Step 2 — scaffold

Vite 7 + TypeScript 5 (strict, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`) + Vitest 3 (jsdom) + Playwright 1.62.

`npm run build` → `tsc --noEmit && vite build && node scripts/assert-selfcontained.mjs`

```
✓ 3 modules transformed.
[plugin vite:singlefile] Inlining: index-BRza27HK.js
[plugin vite:singlefile] Inlining: style-CtCwMk_N.css
dist/index.html  1.48 kB
assert-selfcontained: OK — dist/index.html is self-contained (1.4 kB, no external refs)
```

The build emits exactly one file, `dist/index.html`, with JS and CSS inlined.

### The build assertion

`scripts/assert-selfcontained.mjs` fails the build on:

1. any file in `dist/` other than `index.html`;
2. a non-inert `src` / `href` / `srcset` / `poster` / `action` / `formaction` /
   `data` / `manifest` attribute (inert = `data:`, `blob:`, `#`, empty);
3. a CSS `url(...)` that is not a `data:` URI, and any `@import`;
4. any absolute `http(s)://` literal — XML namespace URIs
   (`http://www.w3.org/2000/svg` and friends) are allowed, since they are
   identifiers, not fetches;
5. any protocol-relative `//host.tld/...` literal;
6. runtime network APIs: `fetch(`, `XMLHttpRequest`, `new WebSocket`,
   `new EventSource`, `navigator.sendBeacon`, `importScripts(`,
   `navigator.serviceWorker`.

The guard is itself tested rather than assumed. `tests/build-guard.test.ts`
runs it against eight fixtures and asserts the exit code: two that must pass
(a fully inlined page; a page using SVG namespace URIs) and six that must fail
(external script, `@import`, external CSS `url()`, a stray asset in `dist/`, a
`fetch()` call, a protocol-relative URL).

`npm test`

```
✓ tests/build-guard.test.ts (8 tests) 489ms
Test Files  1 passed (1)
     Tests  8 passed (8)
```

### e2e

`e2e/scaffold.spec.ts` loads the **built** artifact (Playwright's `webServer`
runs `vite preview` over `dist/`, not the dev server) on a Pixel 5 viewport,
headless, and asserts the inlined bundle executed and that the page issued
**zero** subresource requests.

`PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test`

```
✓ 1 [mobile-chromium] › e2e/scaffold.spec.ts:8:1 › the built single-file artifact boots with no network requests (448ms)
1 passed (3.6s)
```

## Environment note

This container ships Chromium build 1194; `@playwright/test@1.62` expects build
1234 and cannot download it. `playwright.config.ts` therefore honours
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` and, when it is unset, falls back to
Playwright's own managed browser — so CI elsewhere needs no special handling.
Here, run:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npx playwright test
```

## Not done — do not assume otherwise

- `CANON.md` — blocked (see above).
- Engine + five modality modules (step 3) — blocked; `src/main.ts` is a boot
  shell with no gameplay in it.
- Phase A test suite (step 4): RNG determinism, `stepsForLevel`, `scoreStep`
  per modality, fake-timer integration runs, the audio-unlock / level-1 /
  backgrounding-and-resume / second-backgrounding e2e specs, and the
  50-level listener + `AbortController` leak check. None are written. The
  scaffold proves the harnesses run; it does not test any game behaviour.
- Parity diff (step 5) — nothing to diff against.
- `OWNERSHIP.md` — due at the end of Phase A.
- Phase B — not started, and gated on Phase A approval.
