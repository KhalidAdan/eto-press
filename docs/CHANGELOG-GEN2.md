# Generation 2 — the changelog draft

*Drafted for the 2.x publish; not a release note yet. Two editorial
rulings gate the publish itself: the license, and whether the engine
package names stand (they are effectively permanent after first
publish).*

## What generation 2 is

The press split along the platform/engine boundary. The **platform**
(`@eto-press/platform`) is the machinery of a personal periodical — the
journal, front-door reading, the four dialects, the archive, the mail —
and knows nothing of news. An **engine** is an editorial doctrine behind
one joint, `edition(day)`. Five engines ship: **eto** (the news brief),
**desk** (you write, it prints), **letter** (watch an institution's
door, print when it speaks), **digest** (a reading list, not a
retelling), and **sports** (signed columns plus the leagues' own links).
A paper declares its engine in `eto.toml`; absent means eto, so every
generation-1 paper is already valid.

## Breaking, and how it lands

- **Semantic markup.** Site pages now carry anatomy classes
  (`story__differ`, the voices) instead of utility classes; all visual
  decisions live in the default theme (`brief.css`, compiled). The
  default look is pixel-identical. **A paper's custom CSS written
  against the old utility markup must be re-targeted** to the anatomy
  contract (docs: reference/anatomy). Custom pages beside the rendered
  files are untouched.
- **`sources.toml` with no `[[source]]` blocks is now valid** at the
  platform level; the eto engine still refuses to print without sources,
  by name. A known paper-wide flag placed inside a `[[source]]` block is
  now refused instead of silently ignored.
- Everything else is additive: the published-edition store (with a
  legacy fallback, so existing journals need no backfill), `NoEdition`,
  the Desk, the FrontDoor and its document journal, the engine registry,
  `BriefUnverifiable` as a real tagged error.

## Adopting 2.x in an existing paper

1. `npm install @eto-press/press@^2 @eto-press/cli@^2` — deliberately,
   changelog in hand (§10; the pin is the ownership guarantee).
2. `eto doctor` — the checks are engine-aware now.
3. One sandboxed dry edition if you want the belt and suspenders; the
   deterministic path is byte-proven against 1.20260814.1.
4. The next morning prints on generation 2. Readers cannot tell, which
   is the point.

## New since 1.20260814.1, by package

- `@eto-press/platform` — the frame, the Edition document, the
  published-edition store, the Desk, the FrontDoor, the default theme.
- `@eto-press/engine-eto` — stages 1–9 behind the joint; classification
  is the engine's and injected into feed ingest.
- `@eto-press/engine-desk` — the null engine; sub-minute init to first
  edition, no GPU.
- `@eto-press/engine-letter` — event-driven; NoEdition mornings rest.
- `@eto-press/engine-digest` — sections from the masthead's map, the
  day's first-seen links with the feeds' own blurbs.
- `@eto-press/engine-sports` — bylined desk columns and league link
  sections in one edition; the first two-corpus engine.
- `@eto-press/press` — the binding: preflight from `engine.models`, the
  registry, the tail.
- `@eto-press/cli` — `init` asks which engine; `doctor` examines the
  engine you chose.

## Not in this release, on purpose

A public engine/plugin API (the interface stays private until the
contract settles across the five engines), dynamic engine loading,
score tables and figures and the email image pipeline (they arrive when
papers demand them), cadence configuration beyond
daily-plus-NoEdition.
