/**
 * The shelf engine — the writers you follow, one line each.
 *
 * The masthead's sources are writers; `side` names the shelf a writer
 * sits on ("Tech", "Essays"). Every morning the engine ingests the feeds
 * through the platform, keeps the posts first seen THIS run (yesterday's
 * edition already carried yesterday's), and prints one link-list story
 * per shelf: every new post as a row — the title as the link, a one-line
 * deck, the writer named. Nothing is retold; a post is a pointer, and the
 * click is the whole point.
 *
 * The deck (platform/deck.ts): the writer's own blurb when the feed has
 * one; else the desk's, asked of the inference boundary once per post
 * and caged — refused if it says a number, a name or a quoted phrase the
 * post does not. A refused deck is no deck. The engine therefore
 * declares the judge model, and a morning whose posts all carry their
 * own blurbs asks it nothing. No new posts is NoEdition.
 */
import { SqlClient } from "@effect/sql"
import { Effect } from "effect"
import { fetchAccount } from "@eto-press/platform/articles"
import { MATCH_MODEL } from "@eto-press/platform/config"
import { deckFor, outletDeck } from "@eto-press/platform/deck"
import { editionStoryFrom, type EditionStory, type LinkItem } from "@eto-press/platform/edition"
import type { Day, EngineOutcome } from "@eto-press/platform/engine"
import { ingestAllFeeds } from "@eto-press/platform/feeds"
import type { Classifier, Item } from "@eto-press/platform/normalize"

/** A shelf doesn't editorialize kinds: every entry is a post. */
const everythingIsAPost: Classifier = () => "news"

export const ROWS_PER_SHELF = 12

/** Posts grouped under shelves in masthead order, newest first within a
 * shelf, capped. Shelves with nothing new are omitted. */
export const shelve = (
  shelfOrder: ReadonlyArray<string>,
  fresh: ReadonlyArray<Item>
): Array<{ shelf: string; posts: Array<Item> }> => {
  const seen = new Set<string>()
  const ordered = shelfOrder.filter((s) => (seen.has(s) ? false : (seen.add(s), true)))
  return ordered.flatMap((shelf) => {
    const posts = fresh
      .filter((i) => i.side === shelf)
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
      .slice(0, ROWS_PER_SHELF)
    return posts.length > 0 ? [{ shelf, posts }] : []
  })
}

/** One row: the title as the link, the writer and the deck as the note.
 * The writer's name is the attribution and always prints; the deck
 * follows it when there is one. */
export const toRow = (post: Item, deck: string | null): LinkItem => ({
  title: post.title,
  href: post.link,
  note: deck === null ? post.outlet : `${post.outlet} · ${deck}`
})

const edition = (day: Day) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const { items, outcomes } = yield* ingestAllFeeds(day.masthead, day.runId, everythingIsAPost)

    // First seen this run: the items table's run_id is the run that first
    // saw a link, so yesterday's posts belong to yesterday's edition.
    const firstSeen = yield* sql<{ link: string }>`
      SELECT link FROM items WHERE run_id = ${day.runId}
    `
    const freshLinks = new Set(firstSeen.map((r) => r.link))
    const fresh = items.filter((i) => freshLinks.has(i.link))

    const shelves = shelve(
      day.masthead.source.map((s) => s.side),
      fresh
    )

    const stories: Array<EditionStory> = []
    let byOutlet = 0
    let byDesk = 0
    let refused = 0
    for (const { shelf, posts } of shelves) {
      const ref = `shelf:${day.runId}:${shelf}`
      const printed = yield* sql<{ one: number }>`
        SELECT 1 AS one FROM published_stories WHERE engine_ref = ${ref} LIMIT 1
      `
      if (printed.length > 0) continue

      const rows: Array<LinkItem> = []
      for (const post of posts) {
        // The writer's own blurb needs no text and no model. Only a post
        // without one is read in full (the feed's own body when it carried
        // one, journaled at stage 2b; else one polite fetch) and decked.
        const text =
          outletDeck(post.summary) !== null
            ? null
            : ((yield* fetchAccount(post))?.text ?? null)
        const result = yield* deckFor(
          { outlet: post.outlet, title: post.title, link: post.link, summary: post.summary, text: "" },
          text
        )
        if (result.by === "outlet") byOutlet++
        else if (result.by === "desk") byDesk++
        else if (result.refused !== undefined) refused++
        rows.push(toRow(post, result.deck))
      }

      stories.push(
        editionStoryFrom({
          headline: shelf,
          body: "",
          differ: "",
          sourcesLine: "",
          balanceNote: null,
          foldReason: null,
          linkByOutlet: new Map(),
          engineRef: ref,
          links: rows
        })
      )
      yield* Effect.logInfo(`  shelf ${shelf}: ${rows.length} post(s)`)
    }

    if (stories.length === 0) {
      return {
        _tag: "NoEdition",
        reason: `no new posts this morning (${outcomes.length} feeds read)`
      } satisfies EngineOutcome
    }

    const rowCount = stories.reduce((n, s) => n + (s.links?.length ?? 0), 0)
    return {
      _tag: "Edition",
      stories,
      report: {
        feedOutcomes: outcomes,
        dropped: [],
        healthLines: [
          `${rowCount} new post(s) across ${stories.length} shelf(s): ${byOutlet} decked by the writer, ` +
            `${byDesk} by the desk, ${refused} refused by the cage, ` +
            `${rowCount - byOutlet - byDesk - refused} with no deck.`
        ]
      },
      advisoryLines: []
    } satisfies EngineOutcome
  }).pipe(Effect.withSpan("shelf.edition"))

/** The shelf engine: the writers you follow, one line each. */
export const shelfEngine = {
  name: "shelf",
  doctrine: [
    "A reading list with a line under each title. The line is the desk's, not the author's, and it never adds.",
    "The writer's own blurb wins. The desk writes only where the writer wrote nothing.",
    "Every link is the writer's own door. A post is a pointer; the click is the point.",
    "No new posts, no section. Silence over filler."
  ],
  models: [MATCH_MODEL],
  edition
} as const
