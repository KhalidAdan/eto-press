/**
 * The digest engine — a reading list, not a retelling.
 *
 * The masthead's sources are the sections: the `side` field, which for
 * the eto engine names a political stance, here names where an outlet's
 * links belong ("Tech", "World", "Longreads"). Every morning the engine
 * ingests the feeds through the platform, keeps only the links first
 * seen THIS run (yesterday's edition already carried yesterday's), and
 * prints one story per section: no body, no differ — just the links,
 * each with the outlet's name and the feed's own blurb. No models. A
 * morning with no new links is NoEdition.
 */
import { SqlClient } from "@effect/sql"
import { Effect } from "effect"
import { editionStoryFrom, type EditionStory, type LinkItem } from "@eto-press/platform/edition"
import type { Day, EngineOutcome } from "@eto-press/platform/engine"
import { ingestAllFeeds } from "@eto-press/platform/feeds"
import { capText } from "@eto-press/platform/frontdoor"
import type { Classifier, Item } from "@eto-press/platform/normalize"

/** A digest doesn't editorialize kinds: every entry is a link. */
const everythingIsALink: Classifier = () => "news"

const LINKS_PER_SECTION = 8
const BLURB_CAP = 160

export const toLinkItem = (item: Item): LinkItem => {
  const blurb = item.summary.trim() === "" ? null : capText(item.summary, BLURB_CAP)
  return {
    title: item.title,
    href: item.link,
    note: blurb === null ? item.outlet : `${item.outlet} · ${blurb}`
  }
}

/** Sections in masthead order, each with its first-seen links, capped. */
export const sectionize = (
  sideOrder: ReadonlyArray<string>,
  fresh: ReadonlyArray<Item>
): Array<{ section: string; links: Array<LinkItem> }> => {
  const seen = new Set<string>()
  const ordered = sideOrder.filter((s) => (seen.has(s) ? false : (seen.add(s), true)))
  return ordered.flatMap((section) => {
    const links = fresh
      .filter((i) => i.side === section)
      .slice(0, LINKS_PER_SECTION)
      .map(toLinkItem)
    return links.length > 0 ? [{ section, links }] : []
  })
}

const edition = (day: Day) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const { items, outcomes } = yield* ingestAllFeeds(day.masthead, day.runId, everythingIsALink)

    // First seen this run: the items table's run_id is the run that first
    // saw a link, so yesterday's links belong to yesterday's edition.
    const firstSeen = yield* sql<{ link: string }>`
      SELECT link FROM items WHERE run_id = ${day.runId}
    `
    const freshLinks = new Set(firstSeen.map((r) => r.link))
    const fresh = items.filter((i) => freshLinks.has(i.link))

    const sections = sectionize(
      day.masthead.source.map((s) => s.side),
      fresh
    )

    const stories: Array<EditionStory> = []
    for (const { section, links } of sections) {
      const ref = `digest:${day.runId}:${section}`
      const printed = yield* sql<{ one: number }>`
        SELECT 1 AS one FROM published_stories WHERE engine_ref = ${ref} LIMIT 1
      `
      if (printed.length > 0) continue
      stories.push(
        editionStoryFrom({
          headline: section,
          body: "",
          differ: "",
          sourcesLine: "",
          balanceNote: null,
          foldReason: null,
          linkByOutlet: new Map(),
          engineRef: ref,
          links
        })
      )
      yield* Effect.logInfo(`  section ${section}: ${links.length} link(s)`)
    }

    if (stories.length === 0) {
      return {
        _tag: "NoEdition",
        reason: `no new links this morning (${outcomes.length} feeds read)`
      } satisfies EngineOutcome
    }

    const linkCount = stories.reduce((n, s) => n + (s.links?.length ?? 0), 0)
    return {
      _tag: "Edition",
      stories,
      report: {
        feedOutcomes: outcomes,
        dropped: [],
        healthLines: [
          `${linkCount} new link(s) across ${stories.length} section(s). A reading list, not a retelling.`
        ]
      },
      advisoryLines: []
    } satisfies EngineOutcome
  }).pipe(Effect.withSpan("digest.edition"))

/** The digest engine: the day's links, in your sections, then it ends. */
export const digestEngine = {
  name: "digest",
  doctrine: [
    "A reading list, not a retelling.",
    "Every link is the outlet's own front door.",
    "Sections are the masthead's map; the day's links fall into it.",
    "No new links, no edition. Silence over filler."
  ],
  models: [],
  edition
} as const
