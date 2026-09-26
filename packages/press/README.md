# @eto-press/press

*The printing press, not the paper.*

The thin binding that makes a directory into a paper. It reads
`sources.toml` (the editorial line) and `eto.toml` (the nameplate and
plumbing), keeps its journal in `db/`, prints to `archive/` and `site/`,
and reaches outside that directory only to read the news through the
front door and — if configured — to send the mail and write the backups.
The press never owns a paper; it visits one.

Since generation 2 the press is the frame of the morning: preflight
(the masthead, migrations, model pins through the inference boundary),
the engine registry (`eto`, `desk`, `letter`, `digest`, `sports`,
`wrap` — chosen by `[engine] use` in `eto.toml`), the joint where the
chosen engine prints its whole edition in one call, and the tail: the
archive write, the published-edition store, the report. The other
verbs — render, email, correct, export, backup — are here too; the
`eto` command in `@eto-press/cli` is the way to call them.

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
