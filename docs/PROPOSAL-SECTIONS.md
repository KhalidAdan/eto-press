# Generation 3: The Paper, the Sections, the Engines

*Proposal, drafted 2026-09-26 in an editorial session; the rulings the
editor made in that session are recorded at the end. Being executed as a
train of stacked pull requests, each for the editor's review; nothing in
it is released until the train is merged and tagged. Until then,
generation 2 continues as shipped. Companion: the paper-level
constitution, NORTH-STAR.md, which this document builds the machinery
for.*

---

## The Reframe

Generation 2 separated the platform from the engine and let a paper choose
one engine by name. A paper was one engine's edition, printed in the
platform's frame: `[engine] use = "eto"` and one `sources.toml`.

Generation 3 recognizes that a paper was never one desk. It is several,
bound into one morning:

- **A paper** is the frame: the nameplate, the date, the order of sections,
  the archive, the site, the mail, the report. It has a constitution and it
  never decides what a story is.
- **A section** is one desk: a name, a source file, a doctrine, and exactly
  one engine that prints it.
- **An engine** is what it was in generation 2: the editorial machinery
  that turns a masthead into stories. It does not know it is a section. It
  is handed a morning and a masthead and it returns an edition or silence.

The joint moves one level up. Generation 2 met the engine once per morning
at `edition(day)`. Generation 3 meets it once per section per morning, and
binds the results. The Engine interface does not change shape. What
changes is who calls it, how often, and what the caller does with the
answers.

The founding North Star decomposes again, one notch further than the
generation-2 proposal drew it. That proposal put §§7–10 in the platform's
constitution and §§1–6 in the eto engine's doctrine. The editor's ruling of
2026-09-26 moves two more up: §3 (nothing unattributed ships) and §6 (the
masthead is yours) are paper law, not the brief's alone. §§1, 2, 4, 5 stay
the brief's, and the brief keeps its reading-time promise. The founding
text moved unchanged to `docs/sections/brief.md`; the paper-level text is
the new `docs/NORTH-STAR.md`.

## Ownership Surfaces, Revised

| surface | owner | contents |
|---|---|---|
| **Constitution** | the platform | attribution, every masthead is yours, every section states its doctrine, the paper ends, quiet is printed, the front door, the fixed archive, your metal |
| **Doctrine + anatomy** | an engine | the principles it keeps and the semantic anatomy of the stories it produces |
| **Section** | a paper | name, slug, engine, source file, order |
| **Masthead** | a paper | name, motto, description, accent, domain, mail identity, and one source file *per section* |
| **Skin** | a paper | the stylesheet, now over a page that has sections |

Nothing here is new ownership. The section row is the generation-2 masthead
row split into as many pieces as the paper has desks.

## What a Section Declares

In `eto.toml`, replacing `[engine] use`:

```toml
[[section]]
name = "Current events brief"
slug = "brief"
engine = "eto"
masthead = "sections/brief.toml"   # default: sections/<slug>.toml

[[section]]
name = "Business"
slug = "business"
engine = "ledger"

[[section]]
name = "Sports"
slug = "sports"
engine = "ledger"

[[section]]
name = "Blogs"
slug = "blogs"
engine = "shelf"
```

Order in the file is order on the page. Each section's source file has the
same shape `sources.toml` has today: `[[source]]` blocks with `name`,
`side`, `feeds`, and the root flags. What `side` means is the engine's to
say, as it already is (politics on eto, section on digest, league on
sports, board on wrap). The root flag that belongs to the brief alone
(`below_the_fold`) stays in the brief's file; `email_edition` moves to
`eto.toml` because it is the paper's, not a section's, and is honoured
from either place for a generation.

**Compatibility.** A paper with no `[[section]]` blocks is a paper with one
section: slug `brief`, engine from `[engine] use` (default `eto`), masthead
`sources.toml`. Every generation-1 and generation-2 paper is therefore a
valid generation-3 paper, and the flagship is one of them until the day it
adds a second block.

**No email field.** In this generation the morning email has one shape
(below), so a per-section posture would be configuration nothing can
exercise, the same restraint the inference provider registry keeps. The
field arrives with per-section subscription, if that arrives.

**One feed, one section.** A feed URL may appear in one section's source
file only; the frame refuses a paper that lists the same URL under two
sections, by name, at preflight. The journal's `items` table keys an item
by its link and records one `side` for it, so an item can belong to one
desk. Two sections may read the same outlet through different feeds
(the Guardian's world feed for the brief, its business feed for the
business desk); an article that both feeds carry belongs to the feed that
saw it first, which in declared order is the earlier section.

## The Frame, Per Section

`pressRun` today: load the masthead, preflight, one `edition(day)`, the
tail. `pressRun` in generation 3:

1. **Preflight** loads every section's masthead, checks the one-feed-one-
   section rule, and takes the union of the engines' `models`. Ollama is
   woken only if that union is non-empty; the lock is pinned once for the
   union. A paper of desk and digest sections never starts the GPU.
2. **The joint, once per section, in declared order.** `Day` grows one
   field:

   ```ts
   interface Day {
     readonly runId: string
     readonly section: { readonly slug: string; readonly name: string }
     readonly masthead: Masthead
   }
   ```

   The engine gets its own section's masthead and nothing else. Two
   sections on the same engine are two calls with two mastheads. An engine
   that wants to key a cache by section has the slug; an engine that never
   looks at it is still correct.

   Two platform capabilities become section-scoped by the frame, not by
   the engine. The feed ingest reads back only the items this masthead's
   feeds carried (a new `feed_url` column on `items`, null for rows
   ingested before it, which are scoped by outlet name instead). The Desk
   reads `desk/<slug>/` for a section of a sectioned paper and `desk/`
   for the single-section compatibility paper, so a sports column and a
   desk essay never print on each other's page.
3. **Binding.** Each outcome is kept with its section. A section that
   returns `NoEdition` is recorded as absent with its reason. The bound
   result is:

   ```ts
   interface EditionDocument {
     readonly runId: string
     readonly sections: ReadonlyArray<EditionSection>
     readonly absent: ReadonlyArray<{ slug: string; name: string; reason: string }>
     readonly corrections: ReadonlyArray<EditionCorrection>
   }
   interface EditionSection {
     readonly slug: string
     readonly name: string
     readonly stories: ReadonlyArray<EditionStory>
     readonly report: RunReport
     readonly advisoryLines: ReadonlyArray<string>
   }
   ```

   All sections absent is the paper's `NoEdition`: no file, no mail, the
   press rests, exactly as today. Any section absent while another prints
   is a **warning** in the report and a line on the page ("Sports did not
   print this morning: no new columns and no new league links"). The
   constitution's §5.
4. **The tail** is unchanged in kind: corrections, dialects, archive,
   published store, report. Every one of them learns the section.

## The Edition Document

`EditionStory` gains one optional anatomy field:

```ts
/** Optional anatomy: the one-line deck under the headline. The index
 * dialect prints it; a story without one is indexed by its headline
 * alone. Never a model's when the outlet wrote its own. */
readonly deck?: string | null
```

`EditionCorrection` gains `section: string`. `published_stories` gains
`section TEXT NOT NULL DEFAULT 'brief'` and `deck TEXT`, with the primary
key becoming `(run_id, section, position)`. Existing rows read back as the
brief section, so the site, the RSS feed and the correction lookup keep
working over the whole archive with no backfill.

## The Dialects

Five, where there were four. The fifth is the one this generation is for.

**The index.** One renderer, `renderIndex(document, sections)`, that turns
each section into its compressed form: the section head, an optional table
row (the board or the scores), then one row per item of kicker, headline,
deck and source. The site's front page prints it under the brief. It is
one function, so the front page and any future email index stay the same
object. A brief story indexed here uses its headline and its first
sentence; no model writes a deck for the brief.

**Archive (markdown).** One file per day. The heading level moves down one
notch when the paper has more than one section: `# eto — date`, `##
Section`, `### story`. A single-section paper renders byte-identical to
today, which is the gate for step 2 below. Absent sections print one line
each at the end, before the report.

**Site.** The front page is the brief in full, a rule, the index. Section
pages at `/YYYY-MM-DD/<slug>/` are the section's block with bodies, with
"Section 2 of 4" and neighbours. The archive is a month calendar: each day
its lead headline and its section count. The design decisions logged from
the 2026-09-26 research: date line under the nameplate; ears carrying the
motto and the section counts; sections marked by small caps between thin
rules, never boxes or colour; the lean spectrum rendered filled and hollow
with no colour, so the accent is the only colour on the site; no
manifesto on the front page (it lives on the sources page with a link to
the constitution); every section block and the page end with a line that
says so.

**Email.** The brief in full, exactly as today, then after its end mark
and before the footer one card: a section's name, its lead headline this
morning, and a button to that section's dated page on the site. One
section per morning, chosen by hashing the run id over the sections that
printed, so a retry mails the same card and a silent section is never
advertised. Two short lines, one at the top and one at the bottom, say
there is more to eto and link to the site. The email does not otherwise
change, and no reader's subscription changes.

**RSS.** The existing feed link keeps carrying the brief, unchanged, for
the readers already on it. Per-section feeds at `/<slug>/feed.xml` arrive
with this work, the brief first (so it is briefly served at two links) and
the others as their sections go live. The abstraction is built on one
section before it is asked to serve four.

## The Mail: Deferred, Deliberately

Per-section subscription is the obvious end state and the editor ruled
on 2026-09-26 that it is premature for this generation. SES contact lists
already carry topics, and a section-per-topic design is straightforward:
the existing `morning-edition` topic stays the brief's, each further
section becomes a topic named by its slug, the subscribe page grows
checkboxes, and `send-edition` assembles each reader's paper from their
preferences. It touches the subscribe function, the confirm step, the
sender, and the readers backup, and it asks readers to choose before
there is anything to choose from.

Instead the morning email carries the rotating section card described
under the dialects, and the paper collects a season of evidence about
whether anyone follows it before a preference page exists. Topics go on
the roadmap unscheduled.

## The Inference Boundary: A Fifth Question

```ts
/** The deck: one or two sentences that say what ONE text says, written
 * by the desk, not the author. Null when the answer did not take the
 * shape (too long, or a sentence the check below rejects). */
readonly deck: (
  source: { readonly outlet: string; readonly title: string; readonly text: string },
  opts: { readonly unit: string }
) => Effect.Effect<{ readonly deck: string | null; readonly raw: string }, OllamaCallFailed>
```

Journaled in a `decks` table keyed like drafts: link, model, question hash.
The provider owns the prompt. The platform owns the cage, which is small
and cheap: a deck is refused if it exceeds two sentences, or if it contains
a number, a capitalized name or a quoted phrase that does not occur in the
source text. That is "nothing unattributed ships" applied to the one thing
a model writes outside the brief.

The deck never runs when the outlet wrote its own. A feed item with a
summary shorter than the cap is printed as the outlet's deck, credited as
such. The question is asked only for items whose feed carried the full body
or nothing. On a blogs masthead of writers who summarize their own posts,
the shelf engine's `models` list is still non-empty (the engine cannot know
in advance), so the paper wakes Ollama; that is honest, and the cost is a
handful of 4B calls on the mornings that need them.

Model for the deck: audition `qwen3:4b-instruct` first through the lab's
eval scripts. Compression of one text is the judge's kind of task, not the
compositor's, and the 8B model's morning budget is spoken for.

## The Engines

Two new engines, built from platform libraries the way sports was built
from desk plus feeds.

**shelf** (`@eto-press/engine-shelf`): the blogs desk. The digest's shape,
every link the outlet's own front door, plus the deck. Doctrine: *A reading
list with a line under each title. The line is the desk's, not the
author's, and it never adds. Every link is the writer's own door. No new
posts, no section.* `side` names the shelf a writer sits on ("Tech",
"Essays"), as it does on the digest.

**ledger** (`@eto-press/engine-ledger`): the business desk and the sports
desk. Three anatomies in one section, in this order: a board of figures
with their motion (the wrap's reading of data doors), signed columns from
the desk (the sports engine's bylines), and decked links from the outlets'
feeds (the shelf's rows). The masthead makes it business or sports: a
`side` on this engine names a board for a data door and a shelf for a feed.
Doctrine: *The numbers speak; the ledger arranges them. Every figure names
its door and shows its motion. A byline means a human. Every link is the
outlet's own door and its deck adds nothing. Nothing moved and nothing new,
no section.*

`wrap`, `digest` and `sports` stay as they are: they are the zero-model
rungs, and a tier-one paper that never starts a GPU is the ladder's whole
point. `ledger` declares the deck model, so any paper on it wakes Ollama
at preflight; folding the zero-model engines into it would cost those
papers that guarantee. Six engines stay, two are added, nothing is
superseded. (The print name for the scores-and-stocks page is the agate
page; *agate* is reserved for the site's dense tabular typographic mode,
not for an engine, because the ledger prints more than numbers.)

Scores: the ledger reads labeled figures from data doors the way wrap
does; a league's public scoreboard page or JSON is a front door if it is
served to ordinary readers without a key. The sports masthead names those
doors; the engine does not know what a score is, only that a figure moved.

## The Public Engine Interface

Generation 2 left `@eto-press/platform/engine` unpublished because
interfaces drawn from two engines are reliably wrong. There are six engines
and, with this proposal, eight, across four sections on the flagship. The
interface is extracted and published in this generation, with `Day`
carrying the section. What is published: `Day`, `EngineOutcome`, `Engine`,
`EditionStory` and its anatomy types, and the platform libraries an engine
may require (`SqlClient`, `HttpClient`, `Inference`, `Desk`). What stays
private: the frame, the dialects, the journal schema.

## Technical Implications (the honest bill)

- **Time.** Sections run in declared order, sequentially, because the GPU
  is one and the front door is polite. The brief's morning is unchanged;
  each further section adds its feeds and, for shelf and ledger, its deck
  calls. Budget: a blogs desk of twelve new posts, half with their own
  blurbs, is six 4B calls, under a minute. The paperboy's 5:30 window
  holds with room.
- **VRAM.** The 4B judge and the 8B compositor already share the card in
  sequence. Decks on the 4B model add no new resident model. The sidecar
  contention failure mode (whisper, koko) applies exactly as before.
- **The journal.** Additive migrations on `published_stories` and `items`,
  one new table `decks`, one new column on `corrections`. Existing rows
  default to the brief section. No backfill, no rewrite of past archives.
- **The paperboy.** `eto press` is unchanged in shape. The flagship's
  `run-eto.ps1` and the git commit after it are unchanged.
- **Versioning.** This is generation 3: `3.YYYYMMDD.0`. Configuration is
  compatible, but the archive dialect, the published store, the email and
  the newly public engine interface all change shape, and a public
  interface is a promise that deserves the major.
- **The site.** The largest single piece of work and the least risky to
  the constitution: it reads the published store and touches nothing
  upstream. It is its own step below.

## What Does Not Change

- The eto engine. Not one line. It is handed the brief's masthead and
  returns the brief.
- The Engine interface's shape: `edition(day)` returning an edition or
  silence. `Day` gains a field an engine may ignore.
- The four generation-2 dialects' meaning. Each learns the section; none
  changes what it renders for a single-section paper.
- Every paper that exists. No `[[section]]` means one section.
- The standards. `STORY_CAP` and the density gates are the brief's
  journalistic standards and stay hardcoded in its engine. Each new engine
  hardcodes its own (links per shelf, figures per board).

## The Editor's Rulings (2026-09-26)

1. **The masthead line.** *One paper. Several desks. Then it ends.* for the
   paper; *One story. Every side.* stays the brief's.
2. **Engine names.** `shelf` and `ledger`, pending the editor's read of the
   engine table above. Nothing folds; six stay, two are added.
3. **Existing readers** asked for the brief and keep exactly that. The
   email carries the rotating section card and two "more to eto" lines.
   Per-section subscription is deferred (see The Mail).
4. **Scores.** A keyless scoreboard JSON served to the league's own readers
   is a front door. The sports masthead names data doors for last night's
   results and the series state, and named writers' feeds for the trade
   talk, rumours and columns. The narrative of how the playoffs are going
   comes from the writers, never from the press.
5. **RSS.** The brief first, at a new per-section link beside the old one;
   the other sections as they go live.
6. **Two weights of constitution.** The brief keeps a constitution: it can
   move a vote, so it is strict and slow to change. Every other desk gets a
   *desk note*: a short page in `docs/sections/<slug>.md` saying what the
   desk is, what it is not, and what the editor may change without
   ceremony. The shelf's and ledger's doctrines are written in that
   register.

## Sequencing

Each step gated, each shippable alone, in this order, one pull request
each, stacked:

1. **The constitutions.** The paper-level North Star lands in both repos;
   the founding text moves to `docs/sections/brief.md` unchanged; desk
   notes for business, sports and blogs are drafted beside it. Editorial,
   first, and the only step that needs no code.
2. **Sections in the frame.** `[[section]]` in `eto.toml` with the
   compatibility default; `Day.section`; `pressRun` over N sections; the
   bound `EditionDocument`; the absent-section warning; the published
   store migration; the feed-ingest and desk scoping. Gate: the flagship,
   declaring nothing, prints a byte-identical archive and site across
   three sandboxed mornings.
3. **The index dialect and the card.** `renderIndex`; the front page
   prints it under the brief; the rotating section card and the two
   "more to eto" lines in the email; the brief's per-section RSS feed
   beside the existing one. Gate: a two-section sandbox paper (brief plus
   desk) renders the index on the front page and mails the brief with the
   desk's card, the same card on a retry.
4. **The deck and the shelf.** The fifth question and its cage; the
   `decks` table; the shelf engine; the blogs section live on eto.news.
   Gate: the deck cage refuses a planted fabrication in the lab eval; a
   blogs masthead of writers with their own blurbs makes zero model calls.
5. **The ledger.** Boards, columns, decked links; the business and sports
   sections live on eto.news with their mastheads.
6. **The site.** Front page, section pages, the calendar archive, the
   monochrome spectrum, the sources page as the about page. Gate: the
   design decisions above, checked in a real browser, light and dark.
7. **The public interface and the release.** `@eto-press/platform/engine`
   published; docs-site pages for sections and for writing an engine;
   `3.YYYYMMDD.0`.

Step 2 is the structural one and the only one with risk to the brief. Steps
4 and 5 are where the paper grows. Step 6 is where readers see it.

---

*One paper. Several desks. The press prints them all and then it stops.*
