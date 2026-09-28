# Generation 3 — the changelog

*Built 2026-09-26 as a train of seven stacked pull requests (the plan and
the editor's rulings: PROPOSAL-SECTIONS.md), versioned `3.20260926.0`
across all twelve packages and awaiting the editor's review and tag. The
version's date is the day the train was built; a release cut on a later
day re-dates it. Generation-2 papers are untouched until they update, and
a paper that declares no sections prints exactly as it did — the archive
and the whole-paper page byte for byte, the front page redesigned.*

## 3.20260927.0 — the front page is skimmable again

Cut 2026-09-27, the evening after 3.20260926.0, on the editor's first look
at the new front page: one headline in the first screen, the other desks
ten screens down. The lead section is cards again — the outlet's own
preview image with its credit, the headline, the breadth, the spectrum —
each linking to the story on the lead's own dated page, where it is read
in full. The sign-up sits between the lead and the other desks. The index
puts the desks side by side on a wide screen, each with its board and its
first five rows, then a link to the rest. On a card, and only there, the
spectrum's covered positions keep their colours. Eight headlines in the
first two screens, where there was one; the desks start at about 2,300
pixels, where they started at 8,900.

## 3.20260926.0 — the paper grows desks

Twelve packages move together: the ten of generation 2 and two engines.
The steps, in the order they were built:

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
  every new post as a row with its deck, grouped by shelf.
- **The ledger** (this step). A source may declare `kind = "door"` (a
  data endpoint) or `kind = "feed"` (the default); only an engine that
  reads both kinds in one masthead looks at it. The **ledger** engine
  (`@eto-press/engine-ledger`): the business desk and the sports desk in
  one engine — boards of figures with their motion (doors), the section's
  signed columns (the desk), then decked rows from the outlets' feeds
  (shelves), in that order. Motion is measured against the last printed
  board of that section. Nothing moved and nothing new is NoEdition; when
  anything prints, every board prints. Eight engines registered: eto,
  desk, letter, digest, sports, wrap, shelf, ledger.

- **The site** (#15). The front page is the paper compressed: the
  nameplate with its date line and ears (the motto, the desks' counts),
  the lead section in full, the index of every other desk, the subscribe
  form, the archive as a calendar of mornings, the feeds. No manifesto,
  no photo cards. Each desk at `/YYYY-MM-DD/<slug>/` with its neighbours;
  the sources page becomes the about page, the constitution linked when
  `[paper] constitution_url` names one; the side spectrum monochrome, so
  the accent is the only colour on the site.
- **The public interface and the version** (#16). `@eto-press/press/engine`
  publishes `Day`, `Engine`, `EngineOutcome`, the edition anatomy and the
  platform libraries an engine builds its corpus with; `@eto-press/press`
  exports `pressRun` and the registry. A guide, *A paper of sections*.
  Every package at `3.20260926.0`.

**Breaking, for engine authors only:** `Day` carries `section`. No
shipped engine needed a change.

**Not in this generation, deliberately:** per-section email
subscription (SES topics) — the morning email carries the first section
and one rotating card instead; loading an engine by name from a paper
directory — the registry stays static.
