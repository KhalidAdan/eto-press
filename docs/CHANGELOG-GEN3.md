# Generation 3 — the changelog

*Unreleased. Generation 3 is being built as a train of stacked pull
requests (the plan and the editor's rulings: PROPOSAL-SECTIONS.md); this
file accumulates what each step changed, and becomes the release account
when the train is merged and `3.YYYYMMDD.0` is tagged. Generation-2 papers
are untouched until they update, and a paper that declares no sections
prints exactly as it did.*

## In the train, so far

- **The constitutions** (#10). The founding North Star moves unchanged to
  `docs/sections/brief.md` as the Current events brief's constitution;
  `docs/NORTH-STAR.md` is the paper's, eight standards above every
  section; business, sports and blogs get desk notes.
- **The frame prints sections** (#11). `[[section]]` in `eto.toml` — slug,
  engine, name, masthead — with the compatibility rule that no blocks
  means one section on `[engine] use` from `sources.toml`. `Day` gains
  `section`; `pressRun` calls each section's engine in declared order with
  its own masthead and a Desk scoped to `desk/<slug>/`; outcomes bind into
  a `PaperEdition`; a silent section is a warning on the page and in the
  report, every section silent is the paper's `NoEdition`. Preflight
  refuses a feed listed under two sections and pins the union of the
  sections' models. The feed ingest reads a section's window back by its
  own feeds (`items.feed_url`). `published_stories.section` with
  paper-global positions; `corrections.section`. Archive, site, email and
  RSS label desks when there is more than one; a single-section paper
  renders byte-identical to generation 2. `doctor` and `correct` learn
  sections; `[mail] email_edition` in `eto.toml`.
- **The index, the card, feeds per desk** (#12). The fifth dialect: every
  desk after the lead as one row per item — kicker, headline, deck,
  source — on the front page under the lead's cards. `EditionStory.deck`
  as optional anatomy. The morning email carries the first section in
  full and, on a paper with more desks, one section card after the end
  mark (the run id picks the desk among those that printed) plus two
  "there is more" lines. `/feed.xml` keeps carrying the first section;
  `/<slug>/feed.xml` for every declared desk.
- **The deck and the shelf** (this step). The inference boundary's fifth
  question, `deck`: one or two sentences that say what one text says,
  answered by the judge model. The cage (`platform/deck.ts`) refuses a
  deck that runs past two sentences or contains a number, a capitalized
  name or a quoted phrase the piece does not; refusals are journaled in
  `decks` and never re-asked. The outlet's own feed summary wins when it
  is deck-sized, and no model is asked. `fetchAccount` reads one item's
  text through the journal. The **shelf** engine
  (`@eto-press/engine-shelf`): the writers you follow, one line each —
  every new post as a row with its deck, grouped by shelf. Seven engines
  registered: eto, desk, letter, digest, sports, wrap, shelf.

## Still to come in the train

The ledger engine (business and sports: boards, columns, decked links);
the site (front page, section pages, the calendar archive, the monochrome
spectrum); the public engine interface and the release.
