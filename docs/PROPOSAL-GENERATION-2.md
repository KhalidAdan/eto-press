# Generation 2: The Platform and the Engines

*Proposal, drafted 2026-08-14. Not adopted — this document becomes part of
the roadmap only after the editor's review. Until then, generation 1
continues as shipped.*

---

## The Reframe

Generation 1 productized one thing: the eto press, an opinionated
instrument that prints one kind of paper — a bias-clearing current-news
brief — for anyone willing to share its whole opinion.

Generation 2 recognizes that the press has been two things all along:

- **A platform**: the machinery of a personal periodical. Polite
  front-door feed reading, article extraction, the journal with
  resume-by-construction, local model orchestration, the append-only
  archive with corrections, rendering to site and inbox and RSS, the
  subscribe flow, backups, the paperboy verbs, the finite-edition rhythm.
  None of it knows what news is.
- **An engine**: the editorial machinery that decides what a story *is*
  and how it must be told. Prefilter, judge, cluster, the density gates,
  selection, the compositor, the verification cage, the balance
  measurement — and the semantic shape of the edition they produce.

One platform. Many possible engines. eto's is the first.

## Four Ownership Surfaces

| surface | owner | contents |
|---|---|---|
| **Constitution** | the platform | local-first, front-door reading, the archive is fixed, the brief ends, no tracking, runs on your metal |
| **Doctrine + structure** | an engine | the editorial principles and the semantic anatomy of an edition they guarantee |
| **Masthead** | a paper | name, motto, description, accent, editorial line (sources), domain, mail identity |
| **Skin** | a paper | the stylesheet; full editorial CSS rights over the engine's structure. The engine ships a default theme |

The North Star decomposes along the same seam: §§7–10 (the brief ends,
the front door, the fixed archive, your metal) were never editorial —
they are the platform's constitution, inherited by every paper on it.
§§1–6 (one story many mouths, the disagreement is the story, nothing
unattributed ships, the compositor's cage, incomplete beats wrong, the
masthead is yours) are the **eto engine's doctrine** — the first engine's
beliefs, not the machine's. Every engine states a doctrine; every paper
completes it with a masthead. *Every paper gets its own North Star.*

## Structure vs. Skin

The generation-1 mistake (caught by the editor, three arguments deep):
welding the form to the engine, so that a paper wanting its own look had
to fork an engine whose beliefs it shared. Forks are for dissent, not
typography.

The split:

- The **engine guarantees structure** — the semantic anatomy of an
  edition: headline, body, the differ block, the sources line with real
  links, the balance note, the end marker. This is doctrine made
  machine-checkable: the verification cage produces it; it is always in
  the document.
- The **paper owns the skin** — any stylesheet over that structure.
  The engine's default theme (Lora and claret, the hairlines, the
  wordmark's full stop) makes the zero-effort path beautiful; replacing
  it is a paper-level act requiring no fork and no permission.

Enforcement is checkability, not locks. A stylesheet can hide a sources
line the way a fork can delete the verifier — the platform was never in
the technical-enforcement business (the license guarantees the
opposite). The engine's promise is that the structure is present and
honest in every page, so any reader can check. A paper that styles its
attribution invisible has not defeated the engine; it has stopped being
an eto-engine paper. That is a norm the doctrine states, in public, by
name.

## The Cases That Shaped This

- **Canadian eto**: shares the eto engine's doctrine entirely; wants
  their own sources and their own look. Gen 2: eto engine + Canadian
  masthead + Canadian skin. Zero forks.
- **Mark's Sports Extravaganza**: different domain, different beliefs,
  four colors and a blue dragon. Gen 2: his engine, his doctrine, his
  skin, on the same platform — inheriting the constitution (his archive
  is append-only too; his readers are untracked too).
- **eto.news**: the flagship — eto engine, flagship masthead, default
  skin. Where the whole North Star lives in one place.

## Technical Implications (the honest bill)

1. **Semantic markup.** Today's templates are Tailwind utilities welded
   into the structure — the precise reason restyling currently requires
   a fork. Gen 2 emits semantic anatomy (`story__differ`,
   `story__sources`, …) with the default theme layered on top. This is
   the largest single work item.
2. **The package seam.** The monorepo restructures along the
   platform/engine boundary (`packages/platform`, `packages/engine-*`)
   even while one engine exists — cheap now, expensive later.
3. **The engine declaration.** A paper's configuration names its engine.
   The plugin interface is **extracted from the second engine, not
   designed from the first** — interfaces drawn from n=1 are reliably
   wrong. Building a deliberately small second engine (a weekly digest;
   a sports skeleton) is the forcing function, and it is cheaper than
   guessing.
4. **Versioning already fits.** This is what `2.x` means. Generation-1
   papers are untouched until their editors opt in — the pin is the
   ownership guarantee, unchanged.

## What Does Not Change

The constitution's guarantees, the pin-and-deliberate-update ownership
model, the paper directory as the unit of ownership, the mail machinery,
the verbs, the AGPL invitation. A generation-1 paper keeps printing
forever without acknowledging generation 2 exists.

## Open Questions (the editor's desk)

1. **The engine needs a name.** "eto" currently means the press, the
   engine, and the flagship. The platform/engine split makes the
   overload untenable. Editorial call.
2. **Does NORTH-STAR.md split?** Extract the constitution into its own
   small document, or keep one document with marked strata? Editorial
   call.
3. **Skin API shape**: stylesheet-only (safe, simple), or template
   override (powerful, riskier to the structure guarantee)? Proposal
   recommends stylesheet-only first.
4. **The certification norm**: how loudly does "an eto-engine paper"
   assert itself (a footer line? a meta tag? nothing)?
5. **The parked period release**: under this model it is a default-theme
   detail; ship whenever convenient, headline nothing.

## Sequencing

This proposal is deliberately **shelved behind phase 2**. Nothing in
init/doctor/model-management is wasted by it — a wizard that scaffolds a
paper serves any engine. The recommended order remains: phase 2 makes
the press welcoming; generation 2 makes it plural. The package seam
(item 2) is the only gen-2 work worth doing early, because it makes
every later decision cheaper and no current behavior different.

---

## Addendum: As Built (2026-08-16) — drafted for the editor's review

*The header above still reads "not adopted"; that ruling is the editor's.
This addendum records what the build proved and where it amended the
proposal, so the ruling can be made against reality rather than the
sketch.*

The five-step sequence merged to main (PR #2), each step gated
byte-identical or computed-style-identical. Where reality amended the
proposal:

1. **The outcome union grew a third case.** `NoEdition` — true silence, no
   file, no mail — is distinct from the quiet page, and the engine chooses.
   The 2026-08-02 incident made the distinction load-bearing.
2. **The Desk became a capability.** Editor-authored copy needed a door
   that was not the filesystem; the platform now provides read-only desk/
   access, and engines remain without ambient authority.
3. **Anatomy became optional.** The desk engine forced differ blocks and
   sources lines from "always present" to "present when the doctrine
   guarantees them" — the vocabulary generalization this proposal predicted
   would come from n=2, arriving at n=2.
4. **The source list became engine law.** The platform accepts an empty
   masthead; the eto engine refuses it by name; the desk engine never
   looks. Item 3's instinct (engine-declared schema) was right; this is
   its first installment.
5. **The ladder reordered.** The deliberately-small second engine was the
   desk engine, not a weekly digest — smaller than proposed, with a larger
   audience (every writer), and it proved the platform stands alone with
   zero model roles. The event-driven letter is next, then digest, then
   sports.
6. **A finding for the next rung.** The journal's published-edition tables
   (`stories`, `drafts`) are the de-facto interface the site and mail
   dialects reconstruct editions from; the desk engine writes them
   directly. Abstracting that store is the first gen-2 follow-up.
7. **Open questions, updated.** Skin API: stylesheet-only shipped, as
   recommended, amended to "a stylesheet plus assets" for real skins. The
   engine name, the North Star split, and the certification norm remain on
   the editor's desk, and the engine registry is static (`eto`, `desk`)
   with the plugin interface still deliberately unpublished.

---

*One machine, many doctrines, every masthead its own.*
