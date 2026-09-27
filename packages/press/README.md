# @eto-press/press

*The printing press, not the paper.*

The thin binding that makes a directory into a paper. It reads
`sources.toml` (the editorial line) and `eto.toml` (the nameplate and
plumbing), keeps its journal in `db/`, prints to `archive/` and `site/`,
and reaches outside that directory only to read the news through the
front door and — if configured — to send the mail and write the backups.
The press never owns a paper; it visits one.

Since generation 2 the press is the frame of the morning: preflight
(the mastheads, migrations, model pins through the inference boundary),
the engine registry (`eto`, `desk`, `letter`, `digest`, `sports`,
`wrap`, `shelf`, `ledger`), the joint where an engine prints one
section's whole edition in one call, and the tail: the archive write,
the published-edition store, the report. Since generation 3 a paper is
sections — `[[section]]` blocks in `eto.toml`, each naming an engine and
a source file, printed in order and bound into one morning; a paper
that declares none is one section on `[engine] use` from `sources.toml`,
as before. The other verbs — render, email, correct, export, backup —
are here too; the `eto` command in `@eto-press/cli` is the way to call
them. The engine interface is public at `@eto-press/press/engine`.

## In a paper

```
npm install @eto-press/press @eto-press/cli
npx eto doctor
npx eto print
```

`@eto-press/press` exports the public API (`nightly`, `Inference`,
`Ollama`, the masthead schema, `config`); the verbs are subpath exports
(`@eto-press/press/main`, `/render-site`, `/send-edition`, …), and the
default theme is reachable as `@eto-press/press/brief.css` for skins
written against generation 2.

License: AGPL-3.0-only.
