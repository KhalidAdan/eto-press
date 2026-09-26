# Generation 2 — the changelog

*First release `2.20260816.2`, 2026-08-16, when the two gating editorial
rulings were made: the license stays **AGPL-3.0-only**, and the engine
package names stand. Later releases are listed newest first, then the
generation's own account of itself.*

## 2.20260926.0 — the boundary, and the site stands alone

Cut 2026-09-26. Ten packages move together.

- **The inference boundary** (PR #8). The stages never talk to a model:
  they ask the platform's `Inference` service one of a closed set of
  typed questions — same event (stage 4), the below-the-fold nomination
  (6b), the composite (8, and 9's revision pass) — and get typed answers
  back. One provider exists, Ollama, and it owns what used to be spread
  across the eto engine: the prompt templates and their hashes, the
  completion parsers, the per-model knobs. Journal keys are unchanged
  (`model`, `prompt_hash` — the provider's identity for the question), so
  nothing re-judges. `verdicts` gains a nullable `confidence` column: NULL
  from text models, a calibrated probability from any provider that has
  one. Preflight pins through the provider's `pin()`; a provider that
  cannot promise a digest is logged "unpinnable" and never locked.
  `@eto-press/press` exports `Inference` beside `Ollama`.
- **The site depends on nothing outside `site/`.** `eto render` compiles
  the stylesheet itself (the paper's own `brief.css` skin if present,
  else the default theme, now at `@eto-press/platform/brief.css`) and
  copies Lora and IBM Plex Mono into `site/fonts/`. The Google Fonts
  links are gone from every page: no CDN, no third-party request, no
  build step for the operator. `@eto-press/press/brief.css` remains as an
  import of the platform theme, so existing skins keep compiling.
- **A desk paper never needs Ollama** — now true for `eto press` as well
  as `eto print`. The runner wakes Ollama only for an engine that
  declares models. The engine registry lives in `press/src/engines.ts`.
- `sources.toml` and `eto.toml` tolerate a UTF-8 BOM.
- **Breaking for engine authors only:** the engine service ceiling is
  now `SqlClient | HttpClient | Inference | Desk`. An engine that
  required `Ollama` or `FileSystem` directly no longer typechecks — ask
  the boundary, or the Desk. No shipped engine did.
- Removed: `VerdictUnparseable`, an error class nothing ever raised (an
  unparseable verdict is journaled as `abstain` after one re-ask).
- The documentation site, the design documents, and every package
  README were audited against the code and corrected; the
  docs-accuracy tests now also pin the engine registry, the package
  roster, and README presence.

## 2.20260825.0 — the CLI page tells the truth

Cut 2026-08-25. Metadata only: `@eto-press/cli`'s description no longer
promises `init` and `doctor` as future work, and its npm page carries a
README mirroring the verb table.

## What generation 2 is

The press split along the platform/engine boundary. The **platform**
(`@eto-press/platform`) is the machinery of a personal periodical — the
journal, front-door reading, the four dialects, the archive, the mail —
and knows nothing of news. An **engine** is an editorial doctrine behind
one joint, `edition(day)`. Six engines ship: **eto** (the news brief),
**desk** (you write, it prints), **letter** (watch an institution's
door, print when it speaks), **digest** (a reading list, not a
retelling), **sports** (signed columns plus the leagues' own links),
and **wrap** (labeled figures with their motion; nothing moved, no
edition). A paper declares its engine in `eto.toml`; absent means eto,
so every generation-1 paper is already valid.

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
- `@eto-press/engine-wrap` — boards of watched data doors, every figure
  printed with its motion against the last edition.
- `@eto-press/press` — the binding: preflight from `engine.models`, the
  registry, the tail.
- `@eto-press/cli` — `init` asks which engine (eto or desk; the other
  four are chosen in `eto.toml`); `doctor` examines the engine you chose.

## Not in this release, on purpose

A public engine/plugin API (the interface stays private until the
contract settles across the six engines), dynamic engine loading,
score tables and figures and the email image pipeline (they arrive when
papers demand them), cadence configuration beyond
daily-plus-NoEdition.
