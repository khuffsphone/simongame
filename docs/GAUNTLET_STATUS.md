# Gauntlet status

```
runId                 20260814T182208Z-9146ace
repoPath              /home/user/simongame
branch                claude/session-description-unavailable-eqbnbd
baseCommit            9146ace3a942c765062c71b1ecfdd864370ef0b0
currentCommit         (see git log)
dirtyPaths            none at baseline — tree was clean
rulesetVersion        1
contentPackVersion    (none yet — Packet 3)
persistenceVersion    2
activePacket          see below
lastAcceptedArtifact  dist/index.html @ baseline
lastArtifactSha256    1ade162e6751a878fd88f3e0e8b999b6a48671f8f3f5b31b01e749b8315e05f8
```

## Deviations from the gauntlet spec, and why

**Working branch.** The spec asks for `work/modeshift-production-gauntlet`.
This session operates under a standing instruction to develop on
`claude/session-description-unavailable-eqbnbd` and not to push elsewhere
without explicit permission. Creating a second branch would also recreate the
divergent-trunk problem this project spent a full session resolving. Work
continues on the designated branch; every packet is a separate conventional
commit, so the history is equivalent to a packet branch.

## Reference discovery

| Reference | Status |
| --- | --- |
| `MODESHIFT_v6_1.html` | **ABSENT** |
| `MODESHIFT_v6_GAMEPLAY.html` | **ABSENT** |
| `MODESHIFT_ULTIMATE_FUSION_v5_perf.html` | found (uploads) |
| `MODESHIFT_AAA_CASINO_BUILD_20260814_0515.html` | found — this repo's own build |
| `MODESHIFT_UAT_REPORT.md` | found (uploads) |
| Source ZIP | none present |
| `CANON.md`, ADRs, tests, build scripts | present in repo |

v6.1 is the spec's precedence-2 reference for product, audio, haptic,
curriculum and game-feel. It is not present in this environment and cannot be
reconstructed. Per §2 its absence is recorded and work proceeds from the
repository plus this prompt's explicit specification. **Behaviour attributable
only to v6.1 — its audio scene detail, haptic vocabulary, companion lines — is
not invented.** Where this prompt states a requirement outright (for example
the teach-then-integrate ladder in Packet 2) that text is the source, not v6.1.

## Baseline (Packet 0) — measured, not asserted

| Check | Result |
| --- | --- |
| typecheck | exit 0 |
| unit + integration | 150 passed |
| e2e (Pixel 5, headless) | 25 passed |
| build | 50,668 bytes, self-contained assertion OK |
| baseline sha256 | `1ade162e...15e05f8` |

Frame budget, same harness for baseline and candidate:

| Phase | 4× p95 | 8× p95 |
| --- | --- | --- |
| splash idle | 16.7 ms | 16.7 ms |
| menu | 16.8 ms | 16.7 ms |
| presenting | 16.7 ms | 16.7 ms |
| jackpot + next sequence | 16.7 ms | 16.8 ms (worst 33.3) |

Note: the 8× jackpot phase measured 33.3 ms p95 **before** the wall-clock
timing change (decisions/0016) and 16.8 ms after. Removing chained rAF
callbacks from the wait path reduced frame pressure as a side effect.
