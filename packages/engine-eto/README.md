# @eto-press/engine-eto

*The flagship doctrine: one story, many mouths.*

The eto engine decides what a story is — one event, told by at least two
outlets that disagree — and how it must be told: a composited brief with
the disagreements named in plain words, every source linked, and an end.
Stages 1–9 of the pipeline live here, behind the one joint every engine
shares: prefilter, judge, cluster, the density gates, cross-edition
dedupe, selection, the below-the-fold nomination, the compositor, and
the verification cage that checks the compositor's every quote against
the accounts it was given.

It asks a model exactly three typed questions — same event, the
nomination, the composite — through the platform's inference boundary,
and never sees a prompt. Everything else is deterministic code.

## Doctrine

One story, many mouths. The disagreement is the story. Nothing
unattributed ships. The model composites; it does not comment.
Incomplete beats wrong. The masthead is yours.

A paper declares it with `[engine] use = "eto"` in `eto.toml` — or by
saying nothing, since it is the default. It needs at least one
`[[source]]` in `sources.toml` and the two local models
(`eto models pull`).

License: AGPL-3.0-only.
