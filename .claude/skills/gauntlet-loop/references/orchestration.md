# Orchestration: when to fan out, when not to

## The default is sequential

This is counterintuitive, so here is the evidence rather than an assertion.

The public run of the canonical "fan out sub-agents and loop until perfect"
prompt (`mshumer/Claude-of-Duty`, a Three.js FPS, ~55k lines) reported:

| Approach | Score delta | Defects |
| --- | --- | --- |
| 3 rounds × 6 parallel agents, one directory each | +0.46 | — |
| 1 sequential pass, single owner per coupled system | **+1.00** | 66 → 26 |

Critic scores across rounds: 3.59 → 4.14 → **4.05** → 5.05 out of 10. Round
three went *backwards*. The author's stated conclusion: *"Sequential
single-owner passes beat parallel fan-out decisively."* The diagnosis:
*"tonemapping, sky and indirect light are one coupled system and isolated agents
kept breaking each other's assumptions."*

That project was 55k lines across 11 subsystems — far more separable than a
typical single-file app — and parallelism still lost. Assume it loses for you
too unless you can name the boundary that makes it safe.

## The test for whether work can be parallelised

Ask: **do these two workstreams draw from the same finite pool?**

Shared pools, in rough order of how often they cause trouble:

- **frame budget** — every visual effect competes for the same ~16 ms
- **audio mix** — every cue competes for the same headroom and attention
- **colour palette** — every element competes for the same contrast range
- **global timing** — pacing changes ripple through every mode
- **attention** — two "tasteful" flourishes in the same moment are one
  distraction

If two agents draw from one pool, they are one workstream and need one owner.
Each will pass its own review and the composition will fail — not because either
was wrong, but because neither could see the total.

Genuinely independent surfaces do parallelise well: separate modules behind a
plugin boundary, docs, distinct test suites, self-contained features with no
shared visual or timing surface.

## Ownership boundaries, when you do fan out

The discipline that made parallelism work at all in the reference project:

- **Exclusive ownership.** Each agent owns a directory or module and is told
  plainly: *you own this, never edit files outside it.* Ambiguous ownership is
  where clobbering happens.
- **No cross-imports.** Runtime dependency injection or a registry instead of
  direct imports between owned areas, so agents cannot bake in assumptions about
  each other's internals.
- **Events, not shared state.** Cross-system communication through an event
  channel. Shared mutable state is a pool, and pools need single owners.

If a codebase can't support these, that is itself the finding: fix the boundary
before parallelising, or work sequentially.

## The budget keeper

Whenever more than one agent can spend from a shared pool, appoint one agent
that owns the pool's total and can **reject any change**, including changes that
are excellent in isolation.

The keeper must measure the **composed** build, not each agent's branch. Local
green plus local green does not compose to green when the resource is shared —
that is the entire failure mode.

Give the keeper the authority explicitly in its prompt. An advisory keeper gets
overruled by five agents who each have a good argument.

## Critics that terminate

Adversarial critics work — the reference run used eleven and their scores
tracked real quality. What breaks them is the bar.

**Rubric.** Numeric dimensions, 1–5, with what a 3 looks like written down so
scores are comparable across rounds. For a game: readability during play,
feedback clarity, transition smoothness, visual coherence, perceived
responsiveness. Round-to-round comparison is the point; absolute values matter
less than the trend.

**Three exits, all decided before starting:**

1. **Floor reached** — every dimension at or above target, no gate failing.
2. **No progress** — two consecutive rounds without total improvement. Stop and
   report what's stuck. A plateau is information.
3. **Round cap** — a hard maximum. Hitting it is a normal outcome, not a
   failure to be looped around.

**Never** set the bar as beating a title from another genre. It cannot be met,
so the loop cannot end, so the loop ends when someone gets bored — which is the
same as having no criterion at all, but more expensive.

**If the critic is judging visuals, it needs to see them.** Wire a screenshot
pipeline first. A critic reasoning about appearance from source code is
producing plausible prose, not review, and it will happily approve something
broken. If there is no pipeline, say the visual dimension is unassessed rather
than reporting a number for it.

## Where each tool fits

Design exploration and look-and-feel iteration are genuinely better in a fast,
loose environment — Cowork-style sessions produce bolder visual direction than a
test-gated repo loop, and that is worth keeping.

Hardening belongs where the gates live. Gates are code: they need a repo, a test
runner, version control, and the ability to fail a build. A single-file
deliverable can be the *output* of that process but cannot be the place the
process lives.

The practical split: explore in the loose environment, harvest into the trunk as
commits with tests attached, run the gauntlet in the repo. What you must not do
is let both sides keep shipping builds — see Phase 0 in SKILL.md.
