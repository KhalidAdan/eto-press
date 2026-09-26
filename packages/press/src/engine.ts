/**
 * The public engine interface — @eto-press/press/engine (generation 3).
 *
 * Extracted from evidence, not guessed: eight engines across four
 * flagship sections had settled the shape by the time it was published.
 * An engine is handed one morning and one section's masthead and returns
 * an edition or silence; it may require the journal, the front door, the
 * inference boundary and the Desk, and nothing else. The platform
 * libraries an engine builds its corpus with are re-exported here so an
 * engine written outside this monorepo depends on this one subpath.
 *
 * What stays private: the frame, the dialects, the journal's schema.
 */
// -- The joint -----------------------------------------------------------------
export type { Day, DaySection, Engine, EngineOutcome } from "@eto-press/platform/engine"

// -- What an edition is made of ----------------------------------------------
export {
  editionStoryFrom,
  type DataItem,
  type EditionStory,
  type LinkItem,
  type RunReport,
  type SourceLink
} from "@eto-press/platform/edition"
export type { Masthead, Source } from "@eto-press/platform/masthead"
export type { Classifier, Item, ItemKind } from "@eto-press/platform/normalize"

// -- The capabilities an engine may require -----------------------------------
export { Desk, type DeskEntry } from "@eto-press/platform/desk"
export { Inference, type DeckSource, type InferenceApi } from "@eto-press/platform/inference"

// -- The platform libraries an engine builds its corpus with ------------------
export { ingestAllFeeds, type FeedOutcome } from "@eto-press/platform/feeds"
export { fetchAccount, fetchArticlesForStories } from "@eto-press/platform/articles"
export { fetchDocument, fetchRaw, recordDocument, valueAtPath, capText } from "@eto-press/platform/frontdoor"
export { deckFor, deckPasses, outletDeck, type DeckResult } from "@eto-press/platform/deck"
