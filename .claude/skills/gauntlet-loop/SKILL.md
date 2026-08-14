---
name: gauntlet-loop
description: Harden and polish a browser app or game to shippable quality using falsifiable gates instead of vibes. Use this whenever the user wants to "make it AAA", "polish", "maximise the UX", "fan out agents to improve" a game or web app, asks for smooth transitions / juice / visual-audio-haptic feedback, wants a single self-contained HTML build, reports that a build "feels slow" or "drops frames" or "breaks on mobile", or asks to converge two divergent versions of the same app. Also use it when someone proposes an open-ended "loop until it's perfect" prompt — this skill converts that into something that can actually terminate. Especially relevant for single-file HTML games with no network access.
---

# Gauntlet Loop

A process for taking something that works into something that ships, without the
polish pass breaking the thing it was polishing.

## Why this exists

Open-ended polish prompts ("make it AAA, fan out agents, loop until perfect")
fail in three predictable ways, and all three are avoidable.

**They optimise the thing that breaks it.** Decoration is almost always what
eats the frame budget. A prompt that points ten agents at "more polish" points
them all at spending a budget that is already overdrawn.

**They can't stop.** "Loop until a critic is wowed" has no falsifiable exit. The
public run of exactly this prompt (mshumer/Claude-of-Duty) finished at 5.05/10
against its own bar — the stop condition was never met, a human just called it.

**They parallelise coupled work.** The same run measured it: three rounds of six
parallel agents moved the score +0.46 and one round went *backwards*, while a
single sequential pass moved it +1.00 and cut defects from 66 to 26. The
author's conclusion: "Sequential single-owner passes beat parallel fan-out
decisively." Isolated agents kept breaking each other's assumptions about a
shared, coupled system.

The fix for all three is the same: **write the gates before the work, make them
executable, and let them be the critic.**

## The core rule

> A gate is only a gate if a run can fail it and you find out automatically.

"Looks AAA" is not a gate. "p95 frame time ≤ 20 ms at 4× CPU throttle" is. Every
loop in this process terminates because a gate goes green, never because someone
declares satisfaction.

When you catch yourself writing an acceptance criterion that a reasonable person
could argue about, either make it measurable or move it out of the gate list and
into a review note.

## Phase 0 — One trunk

Before anything: if two versions of the app exist (a pretty one and a tested
one, a Cowork build and a repo build), converge them. Two trunks means every
report has to ask "which build?", fixes land in one and not the other, and the
divergence compounds with every round.

Pick the trunk by asking which is cheaper to recover: **tests and history are
harder to rebuild than visuals.** Usually that means the repo is trunk and the
prettier build is a source of patches, not a parallel line. Port its wins in as
commits with tests attached.

Say out loud which build is trunk and which is being harvested. Do not skip
this to get to the fun part; unconverged trunks are the most expensive kind of
technical debt in this workflow because they double every future gate run.

## Phase 1 — Write the gates first

Gates are code, in the repo, wired into the build and the test suite. Writing
them first means the polish work has something to push against from its first
commit rather than being audited at the end.

Start from `references/gates.md`, which catalogues the gates worth having for a
browser game and gives the measurement approach for each. Take what applies;
delete what doesn't. A gate you can't justify is noise.

The two that catch the most damage, in order:

1. **Frame budget under throttle.** `scripts/measure-frames.mjs` measures p95
   and mean frame time in named phases under CDP CPU throttling and exits
   non-zero when a phase blows its budget. Wire it into CI. Without this, every
   perf claim in every report is an opinion.
2. **Timing decoupled from the frame clock.** If presentation timing is derived
   from `requestAnimationFrame` deltas, then when frames drop the app *shows*
   the user one thing and *grades* them against another. In a rhythm or memory
   game this makes the game unwinnable, silently, only on slow devices. See
   `references/gates.md` for the wall-clock + minimum-painted-frames pattern and
   the test that proves it.

Write the gates so they fail loudly on the current build if the defect is
present. A gate that passes on a known-broken build is not measuring anything.

## Phase 2 — Correctness before polish

Fix every gate failure that exists today. No new visual work until the gate
suite is green on the current trunk.

This ordering is not bureaucratic. Polish added on top of a correctness bug gets
blamed for the bug, gets reverted with the bug, and has to be redone. And a
frame-budget gate is meaningless as a constraint on new work if the baseline
already violates it.

## Phase 3 — Polish, with a budget keeper

Now fan out — but only along boundaries where two agents genuinely cannot
collide.

**Split by ownership, not by task.** Give each agent a directory or module it
owns exclusively, and say so: *you own this, never edit outside it*. Cross-
system communication goes through events or injected dependencies, not shared
mutable state. This is the discipline that made parallelism work at all in the
reference run.

**Anything coupled goes sequential, single owner.** Frame budget, colour
palette, audio mix, and global timing are shared resources. Two agents each
adding a "tasteful" glow will each pass their own review and jointly blow the
budget. If two workstreams draw from the same pool, they are one workstream.

**Appoint a budget keeper.** One agent owns total frame cost and can reject any
change, including changes that look great in isolation. It runs the frame gate
against the composed build, not against each agent's branch. Without this role,
fan-out reliably produces a build where every part passed and the whole fails.

## The critic, made falsifiable

Adversarial critics are genuinely useful — the reference run used eleven of them
and their scores tracked real quality. What sinks them is an unreachable bar.

Give the critic a **rubric with numeric dimensions** (readability during play,
feedback clarity, transition smoothness, visual coherence, perceived
responsiveness — score each 1–5, with what a 3 looks like written down), and
give the loop three exits:

- **Floor reached:** every dimension ≥ target and no gate failing. Ship.
- **No progress:** two consecutive rounds fail to improve the total. Stop and
  report what's stuck — that's information, not failure.
- **Round cap:** a hard maximum, decided up front. Reaching it is a normal
  outcome.

Never set the bar as "better than <a AAA title in a different genre>". A memory
game does not beat Call of Duty in a blind visual comparison, and a loop with an
unreachable exit is a loop that runs until someone kills it.

Screenshot-based critique needs an actual screenshot pipeline. If there isn't
one, the critic is reviewing its own imagination — say so rather than pretending.

## Reporting

Every round ends with a report in this shape, because each section is a
different failure mode being surfaced:

```
## What changed
## Commands run, and their output       <- verbatim, not paraphrased
## What passed
## What is UNVERIFIED, and why          <- name the thing you could not measure
## Biggest remaining risk
```

The UNVERIFIED section is the point. Anything not run in this environment — real
device FPS, audible output, haptics, iOS Safari, actual touch hardware — gets
named there. Writing "should work" anywhere in a report is a defect in the
report.

If the deliverable is a downloadable build: give it a **unique filename every
time** (timestamped) and publish its **SHA256**. Reusing a filename makes two
different builds indistinguishable in a chat log, which is how divergent trunks
start.

## Anti-patterns

| Tempting | Why it fails |
| --- | --- |
| "Loop until it's perfect" | No exit. Runs until you kill it. |
| "Blind-compare against \<AAA title\>" | Unreachable in a different genre; guarantees a non-terminating loop. |
| Rewriting in a heavier engine mid-polish | Discards the tested code and worsens the perf problem that prompted the polish. |
| Fanning out on coupled systems | Every agent passes locally, the composition fails. Measured, not theoretical. |
| Auditing perf at the end | The gate has to exist before the work, or it's an autopsy. |
| Critic with no rubric | Scores drift, rounds don't compare, no stop condition. |

## Bundled resources

- `references/gates.md` — the gate catalogue: frame budget, timing decoupling,
  self-containment, input activation, readability, accessibility. Read this in
  Phase 1 and pick what applies.
- `references/orchestration.md` — how to decide sequential vs parallel, the
  ownership-boundary pattern, the budget-keeper role, and the evidence behind
  the default. Read before fanning out.
- `scripts/measure-frames.mjs` — Playwright + CDP frame-time probe. Measures
  named phases under CPU throttle, exits non-zero on budget violation.
- `scripts/assert-selfcontained.mjs` — fails a build whose artifact references
  any external URL or calls a network API. Drop-in for single-file deliverables.
