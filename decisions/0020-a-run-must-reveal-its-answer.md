# 0020 — A run must reveal its answer

## Status

Accepted. Adds a normative subsection to CANON §6 and two required statics to
the modality contract in CANON §3.

## Context

The fail overlay read:

> RUN OVER
> Wrong step. You reached level 7.

It told the player the one thing they already knew and withheld the only thing
they wanted. On colour that is merely unsatisfying. On sound it is close to
unplayable as a learning experience: the player heard a pitch, guessed, was told
"wrong", and has no way to find out which pitch it was — so the next attempt is
the same guess. On trace the player does not learn whether they misremembered
the glyph or drew it badly, which are opposite problems with opposite fixes.

The usual argument against revealing is spoiling. It does not apply. The run is
over. The sequence is spent. The next run draws a different one from a new seed.
There is nothing left to protect.

## Decision

The `fail` event carries the failing step, the player's input, and the accuracy.
The overlay renders all three.

`ModalityClass` gains two **required** statics:

```ts
static describeValue(value: V): string      // "Blue", "a zigzag", "5 taps · short · short · short · long"
static describeCapture(capture: C): string  // "Red", "a tap, not a stroke", "4 taps, evenly spaced"
```

Required, not optional. An optional method here is a modality that ships with
"Wrong step." and nothing else — which is the defect, reintroduced by the next
person to add a modality. Making it required means TypeScript refuses the
registration. It caught the test double immediately when the change landed.

Two methods rather than one because value and capture are genuinely different
types for two modalities: trace's value is a glyph name and its capture is a
point array; rhythm's value is a pattern index and its capture is an interval
list. `Modality<V, C>` has had two type parameters since decisions/0011 for
exactly this reason, and the reveal has to respect it.

Formatting lives in `src/ui/reveal.ts` as a pure function of
`(registry, failEvent)`, so every string a player can read is unit-testable
without a browser.

### Wording rules, each with a reason

- **`focus-lost` reveals nothing about a step.** The player was not wrong, they
  were away. Naming an answer they were never asked for reads as an accusation.
- **A timeout names the answer and never says "You gave".** They gave nothing;
  inventing an input would be a lie about the player's own actions.
- **The attempt line is dropped when it matches the answer line.** Trace and
  rhythm score by shape, not identity, so a *failing* attempt can carry an
  identical description. "You gave 4 taps, evenly spaced." directly under "The
  answer was 4 taps, evenly spaced." reads as a bug, and worse, it tells the
  player they were right.
- **Trace describes the attempt by its shortfall**, not its shape: "nothing
  drawn", "a tap, not a stroke", "a stroke too short to read". Those are
  actionable. "Your curve deviated by 0.19 RMS" is not.
- **Rhythm describes taps and gaps, never milliseconds.** Nobody can act on
  "420, 420, 420".
- **A formatter that throws costs its own line and nothing else.** The overlay
  always opens; a broken description must not leave the player on a dead screen.

## Consequences

- Every modality now has to be able to say what its answers are, in words. This
  turned out to be a good forcing function: writing `sound`'s labels made it
  obvious that "tone 1" is useless and `G3, the lowest` is not.
- Adding a modality costs two more small statics. Cheap, and the compiler asks.
- Not built: re-*showing* the answer — replaying the pad flash or redrawing the
  glyph in the overlay. It would be better than text for trace especially. It
  needs the modality to render while deactivated and the overlay to sit behind
  rather than over the stage, which is a Packet 1 layout change. Recorded in
  KNOWN_LIMITATIONS.

## Alternatives rejected

- **Optional statics with a text fallback.** Ships the defect for any modality
  whose author forgets. The compiler should be the reviewer here.
- **A single `describe(value | capture)`.** Collapses two types into one and
  produces "you drew line" for a point array.
- **Reveal only after a threshold** (e.g. only past level 5, or only after
  repeated failures on the same modality). Gating information the player has
  already earned by losing, in order to manufacture frustration, is the kind of
  thing this project does not do.
