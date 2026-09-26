# @eto-press/engine-wrap

*The numbers speak; the wrap arranges them.*

The masthead's sources are watched data doors — pages or feeds that
carry figures. Every morning the engine reads each one, picks out the
labeled figures its masthead entry points at, and prints them with
their motion since the last edition. A board whose numbers did not move
prints nothing; a morning where nothing moved anywhere is `NoEdition`.

Declare it with `[engine] use = "wrap"` in `eto.toml`. On this engine a
source's `side` is its board. It never needs Ollama.

License: AGPL-3.0-only.
