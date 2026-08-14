# 0012 — Sound presentation does not light the pad

**Status:** accepted (Phase B)

## Context

The sound modality reuses the four-pad grid. The obvious implementation lights
the pad being presented, exactly as colour and number do.

The reference builds do this. It collapses the modality: if the pad lights up,
the player never has to identify the pitch, and "Sound" becomes "Colour with a
beep". The whole point of the modality disappears while looking like it works.

## Decision

`DiscreteGridModality` gained `revealsPadDuringPresentation`, default true.
Sound overrides it to false: presentation plays the tone and marks the **grid**
with `data-listening`, which pulses the whole board and dims the pads. No
individual pad is marked. An e2e spec asserts that zero pads carry
`data-presenting` while a sound step is playing.

## Why

A modality is defined by what it withholds. Making the withholding a property of
the base class — rather than a copy-pasted override of `presentStep` — means the
next audio-like modality inherits the right default and cannot forget it.

## Tradeoff

Sound is now materially harder than the other four, because there is no visual
channel at all. Pads carry a bar-height ramp and a note name so pitch order is
learnable, and the modality declares a longer `minPresentMs` (520 ms), but a
tone-deaf player will simply fail this mode. That is the honest consequence of
the mode existing; the fix if it proves too harsh is a difficulty-scaled hint,
not lighting the pad.
