# @eto-press/platform

*The machinery of a personal periodical. None of it knows what news is.*

The platform is everything a paper needs that is not an editorial
doctrine: the journal (one SQLite file, every expensive unit of work
keyed and cached), front-door reading (feeds, articles, watched
documents), the inference boundary (the closed set of typed questions an
engine may ask a model, answered today by the Ollama provider), the
edition document and its four dialects (markdown archive, site, email,
RSS), the published-edition store, the default theme, the mail, and the
verbs behind the `eto` command.

An **engine** — a package that decides what a story is and how it must be
told — meets the platform once per morning at `edition(day)`. Six ship
in this monorepo; `@eto-press/press` binds one to a paper.

## What it exports

Every module under `src/` is importable as `@eto-press/platform/<name>`;
the default theme is `@eto-press/platform/brief.css`. The ones an engine
author reaches for: `engine` (the joint's types), `edition` (the story
document and `editionStoryFrom`), `inference` (the boundary), `feeds` and
`frontdoor` (reading the world), `db` (the journal's schema), `errors`
(the catalog), `masthead` and `config` (a paper's two files).

## Documentation

The operator path and the internals are both at the press's
documentation site (`docs-site/` in the repository). The design
documents — the North Star, the pipeline, the roadmap — are in `docs/`.

License: AGPL-3.0-only.
