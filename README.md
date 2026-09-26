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

Since generation 2, the press is split along the platform/engine boundary
(docs/PROPOSAL-GENERATION-2.md): the platform is the machinery of a
personal periodical and knows nothing of news; an engine is an editorial
doctrine; they meet once per morning at `edition(day)`.

| package | what it is |
|---|---|
| `@eto-press/platform` | the machinery: journal, front-door reading, the inference boundary, dialects, archive, mail, verbs |
| `@eto-press/engine-eto` | the flagship doctrine: prefilter, judge, cluster, composite, the cage |
| `@eto-press/engine-desk` | the null engine: the editor writes, the press prints |
| `@eto-press/engine-letter` | watch an institution's door; print when it speaks |
| `@eto-press/engine-digest` | a reading list, not a retelling |
| `@eto-press/engine-sports` | signed columns beside the leagues' own links |
| `@eto-press/engine-wrap` | labeled figures with their motion; nothing moved, no edition |
| `@eto-press/engine-shelf` | the writers you follow, one line each: a deck under every title, caged |
| `@eto-press/press` | the thin binding: preflight, the joint, the tail, the engine registry |
| `@eto-press/cli` | the `eto` command — the paperboy's verbs |
| `@eto-press/subscribe` | the mail slot: double-opt-in flow as Pages Functions |

Versioning is `generation.YYYYMMDD.patch` (valid semver; the date is the
release day). Both generations ship TypeScript source consumed via `tsx`;
the compile-and-bin story arrives with a later generation. Releases are
tagged `v<version>` and, until npm trusted publishing works for this
organization, published by hand from each package directory in
dependency order (the same order `publish.yml` narrates).

## Documentation

User and developer documentation lives in [`docs-site/`](docs-site) —
`npm run dev` there serves it. Two personas, on purpose: the operator path
(quickstart, guides, reference) for whoever wants a paper running, and the
Internals section for whoever wants to understand the machine. The design
documents (North Star, pipeline, roadmap, experiments) stay in
[`docs/`](docs).

## Status

Extracted 2026-08-13 from the flagship paper's repository with its code
history (editions stripped). The flagship — eto.news — is customer #1 and
consumes these packages like any other paper.

The **1.x line** is published on npm (`1.20260814.1`) and frozen; papers
pinned to it keep printing untouched. The **generation-2 line** is
current (`2.20260926.0`, cut 2026-09-26): ten packages — the platform,
six engines, the press, the CLI, and the subscribe worker. Its changelog
is [docs/CHANGELOG-GEN2.md](docs/CHANGELOG-GEN2.md).

License: **AGPL-3.0-only** — run it, change it, redistribute it; if you
serve readers with a modified press, they are owed the source. The press
is free the way the North Star promises, and a hosted fork stays honest.
