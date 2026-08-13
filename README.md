# eto-press

*The printing press, not the paper.*

eto is a local-first daily news brief: each story is one event told through
outlets that disagree, the disagreement named in plain words, every source
linked, and then the brief ends. The product's constitution is
[docs/NORTH-STAR.md](docs/NORTH-STAR.md); the plan for this repository is
[docs/ROADMAP.md](docs/ROADMAP.md).

This monorepo is the press. A **paper** is a directory the press operates
on — `sources.toml` (the editorial line), `eto.toml` (the nameplate and
plumbing), `db/` (the journal), `archive/` and `site/` (the editions).
The press never owns a paper; it visits one.

## Packages

| package | what it is |
|---|---|
| `@eto-press/press` | the engine: pipeline, verification cage, renderers |
| `@eto-press/subscribe` | the mail slot: double-opt-in flow as Pages Functions |

Versioning is `generation.YYYYMMDD.patch` (valid semver; the date is the
release day). Generation 1 ships TypeScript source consumed via `tsx`;
the compile-and-bin story arrives with the CLI package.

## Status

Extracted 2026-08-13 from the flagship paper's repository with its code
history (editions stripped). The flagship — eto.news — is customer #1 and
consumes these packages like any other paper. License: not yet decided.
