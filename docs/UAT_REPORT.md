# UAT report — run `20260814T182208Z-9146ace`

Artifact: `MODESHIFT_PRODUCTION_RC_20260814T183320Z_8858faf.html`
SHA-256: `4902e811d76155f0803ba8e45497a46f29c8b5890296c561e373b2f1761a6a8f`
Size: 51,757 bytes
Commit: `8858faf`
Ruleset version: 1 · Content-pack version: none · Persistence version: 2

## Commands run

| Command | Result |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm test` | 141 passed, 11 files |
| `npm run build` | 51,757 bytes; self-contained assertion OK |
| `npx playwright test` | 26 passed |
| frame gate @ 4× | all phases PASS |
| frame gate @ 8× | all phases PASS |
| offline `file://` replay, network blocked | reached armed capture; zero non-file requests; zero page errors |

## Performance — same harness, baseline vs candidate

390×844 DPR 2, CDP CPU throttling, p95 frame time.

| Phase | Baseline 4× | Candidate 4× | Baseline 8× | Candidate 8× |
| --- | --- | --- | --- | --- |
| splash idle | 16.7 ms | 16.8 ms | 16.7 ms | 16.8 ms |
| menu | 16.8 ms | 16.8 ms | 16.7 ms | 16.7 ms |
| presenting | 16.7 ms | 16.7 ms | 16.7 ms | 16.8 ms |
| jackpot + next sequence | 16.7 ms | 16.7 ms | 16.8 ms | 16.7 ms |

No regression. For context, the 8× jackpot phase measured **33.3 ms p95 before
the wall-clock timing change** (`decisions/0016`) — removing chained rAF
callbacks from the wait path reduced frame pressure as a side effect of a
correctness fix.

## Viewports

Screenshots captured at 360×800, 390×844, 412×915, 768×1024, 1440×900, DPR 2.
Checked per viewport: no horizontal overflow on the menu (the screen most at
risk), splash/menu/presenting/capture render, plus level-clear and fail at
390×844. 22 screenshots under
`artifacts/gauntlet/20260814T182208Z-9146ace/screenshots/`.

One 404 was logged during the 360×800 pass. It did not reproduce on a clean
load and no failing response appears when the page is loaded on its own; the
app is asserted to issue zero subresource requests by
`e2e/scaffold.spec.ts`. Recorded as a browser-initiated favicon request, not
an application request.

## Test counts

| Category | Count |
| --- | --- |
| Unit + integration (Vitest) | 141 |
| Browser e2e (Playwright) | 26 |
| Frame-budget gate phases | 8 (4 phases × 2 throttles) |
| Offline artifact replay | 1 |
| Leak / endurance | 1 (50 simulated levels) |
| Content validation | 0 — no content pack exists yet |
| Accessibility | partial — activation paths and 44 px targets only |

## Open defects

See `docs/KNOWN_LIMITATIONS.md`. No Severity 0 or 1 defect is known. The
unbuilt packets are scope, not defects; the product defects listed there are
verified in code and unfixed.
