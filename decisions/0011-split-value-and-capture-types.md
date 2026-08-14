# 0011 — The modality contract is generic over value *and* capture types

**Status:** accepted (Phase B)

## Context

`Modality<V>` used one type parameter for three things: what `generateValue`
produces, what `captureStep` returns, and what `scoreStep` compares. That holds
for the discrete modalities, where a step value and a tap are both an option
index. It does not hold for trace: the value is a glyph name (`'zigzag'`), the
capture is an array of pointer samples.

## Decision

`Modality<V, C = V>`. `generateValue` and the `expected` argument of `scoreStep`
use `V`; `captureStep` and the `input` argument of `scoreStep` use `C`. Discrete
modalities keep the single-parameter default and are unchanged.

## Why

The alternative was `Modality<string | Point[]>` and a cast in every scorer,
which makes the type document nothing and moves the error from compile time to
the first wrong-glyph run. Two parameters cost one line in the interface and
make the trace scorer's signature honest: `(CaptureResult<Point[]>, string)`.

## Tradeoff

Every `AnyModalityClass` erasure now carries two `any`s instead of one, and the
engine's internal maps are correspondingly looser. The engine never inspects
either type — it hands `value` straight back to the modality that produced it —
so the looseness is contained to code that genuinely does not care.
