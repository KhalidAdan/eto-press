/**
 * The ledger engine — the lay of the land as of yesterday.
 *
 * One masthead, two kinds of source, three anatomies in a fixed order:
 *
 *   1. Boards. Sources with `kind = "door"` are data doors (the wrap
 *      engine's convention: a JSON or plain-text endpoint, an optional
 *      `#dot.path`); `side` names the board. Every figure prints with its
 *      motion since the last PRINTED figure of that board in this
 *      section — the store's truth, not the engine's last fetch.
 *   2. Columns. The section's desk entries (`# headline`, `by: Name`,
 *      the take) print once, bylined. A byline always means a human.
 *   3. Shelves. Sources without a kind are feeds; `side` names the shelf.
 *      Every post first seen this run prints as a row with its deck
 *      (platform/deck.ts: the outlet's own summary, else the desk's,
 *      caged).
 *
 * Nothing is composited. Nothing moved and nothing new is NoEdition;
 * when anything prints, every board prints — the section shows the whole
 * state of the world it watches, not just the parts that twitched.
 *
 * The board and column code is the wrap's and the sports engine's,
 * carried here rather than imported: engines depend on the platform,
 * never on each other.
 */
import { SqlClient } from "@effect/sql"
import { Effect } from "effect"
import { createHash } from "node:crypto"
import { fetchAccount } from "@eto-press/platform/articles"
import { MATCH_MODEL } from "@eto-press/platform/config"
import { deckFor, outletDeck } from "@eto-press/platform/deck"
import { Desk, type DeskEntry } from "@eto-press/platform/desk"
import { editionStoryFrom, type DataItem, type EditionStory, type LinkItem } from "@eto-press/platform/edition"
import type { Day, EngineOutcome } from "@eto-press/platform/engine"
import { ingestAllFeeds, type FeedOutcome } from "@eto-press/platform/feeds"
import { fetchRaw, recordDocument, valueAtPath } from "@eto-press/platform/frontdoor"
import type { Masthead, Source } from "@eto-press/platform/masthead"
import type { Classifier, Item } from "@eto-press/platform/normalize"

const everythingIsAPost: Classifier = () => "news"
export const ROWS_PER_SHELF = 10

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex")

// -- The masthead's two kinds --------------------------------------------------

/** Doors are boards; everything else is a feed. */
export const partition = (
  masthead: Masthead
): { doors: Array<Source>; feeds: Array<Source> } => ({
  doors: masthead.source.filter((s) => s.kind === "door"),
  feeds: masthead.source.filter((s) => s.kind !== "door")
})

// -- Boards (the wrap's reading of data doors) --------------------------------

/** "url#dot.path" → the door to knock and the value to pull. */
export const parseDoor = (feed: string): { url: string; path: string | null } => {
  const hashAt = feed.indexOf("#")
  if (hashAt === -1) return { url: feed, path: null }
  return { url: feed.slice(0, hashAt), path: feed.slice(hashAt + 1) || null }
}

/** The motion note: numeric values get a signed delta, everything else an
 * honest "was". A first sighting has no motion to report. */
export const motionNote = (current: string, previous: string | null): string | null => {
  if (previous === null || previous === current) return null
  const now = Number(current)
  const then = Number(previous)
  if (Number.isFinite(now) && Number.isFinite(then)) {
    const delta = now - then
    const magnitude =
      Math.abs(delta) < 1
        ? delta.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")
        : String(Math.round(delta * 100) / 100)
    return `${delta > 0 ? "▲ +" : "▼ "}${magnitude} since last edition`
  }
  return `was ${previous}`
}

// -- Columns (the sports engine's reading of the desk) ------------------------

/** A column: "# headline", an optional "by: Name" line, then the body. */
export const parseColumn = (
  entry: DeskEntry
): { headline: string; byline: string | null; body: string } => {
  const lines = entry.content.split(/\r?\n/)
  const headingAt = lines.findIndex((l) => /^#\s+\S/.test(l))
  const headline =
    headingAt >= 0
      ? lines[headingAt]!.replace(/^#\s+/, "").trim()
      : entry.file.replace(/\.md$/, "").replace(/[-_]+/g, " ").trim()
  const rest = headingAt >= 0 ? lines.slice(headingAt + 1) : lines
  const firstContent = rest.findIndex((l) => l.trim() !== "")
  const bylineMatch =
    firstContent >= 0 ? rest[firstContent]!.trim().match(/^by:?\s+(.+)$/i) : null
  const byline = bylineMatch?.[1]?.trim() ?? null
  const body = (byline !== null ? rest.slice(firstContent + 1) : rest).join("\n").trim()
  return { headline, byline, body }
}

// -- Shelves (the shelf engine's rows) ----------------------------------------

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

export const toRow = (post: Item, deck: string | null): LinkItem => ({
  title: post.title,
  href: post.link,
  note: deck === null ? post.outlet : `${post.outlet} · ${deck}`
})

// -- The morning's verdict -----------------------------------------------------

/** Nothing moved and nothing new is silence; anything else prints the
 * whole desk. Pure, so the rule is testable without a journal. */
export const decide = (counts: {
  readonly moved: number
  readonly columns: number
  readonly posts: number
}): "print" | "silence" =>
  counts.moved > 0 || counts.columns > 0 || counts.posts > 0 ? "print" : "silence"

// -- The edition ---------------------------------------------------------------

const edition = (day: Day) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const desk = yield* Desk
    const { doors, feeds } = partition(day.masthead)
    const slug = day.section.slug
    const outcomes: Array<FeedOutcome> = []

    // -- 1. boards ------------------------------------------------------------
    const boards = new Map<string, Array<{ label: string; value: string }>>()
    for (const source of doors) {
      for (const [i, feed] of source.feeds.entries()) {
        const { url, path } = parseDoor(feed)
        const label = source.feeds.length === 1 ? source.name : `${source.name} #${i + 1}`
        const started = Date.now()
        const fetched = yield* fetchRaw(source.name, url).pipe(Effect.either)
        if (fetched._tag === "Left") {
          outcomes.push({
            outlet: source.name,
            url,
            status: "unreachable",
            itemsKept: 0,
            ms: Date.now() - started,
            detail: String(fetched.left.cause).slice(0, 120)
          })
          yield* Effect.logWarning(`  door closed: ${label} ${url}`)
          continue
        }
        const value = valueAtPath(fetched.right, path)
        if (value === null) {
          outcomes.push({
            outlet: source.name,
            url,
            status: "malformed",
            itemsKept: 0,
            ms: Date.now() - started,
            detail: `no value at ${path ?? "(body)"}`
          })
          yield* Effect.logWarning(`  no value at ${path ?? "(body)"}: ${label}`)
          continue
        }
        const record = yield* recordDocument(day.runId, {
          url: feed,
          title: label,
          text: value,
          contentHash: sha256(value)
        })
        outcomes.push({
          outlet: source.name,
          url,
          status: "ok",
          itemsKept: record.isNew ? 1 : 0,
          ms: Date.now() - started,
          detail: null
        })
        const rows = boards.get(source.side) ?? []
        rows.push({ label, value })
        boards.set(source.side, rows)
      }
    }

    // Motion against the last PRINTED figures of this board in this section.
    let moved = 0
    const boardStories: Array<EditionStory> = []
    for (const [board, rows] of boards) {
      const prefix = `ledger:${slug}:board:`
      const lastPrintedRow = yield* sql<{ data_items: string | null }>`
        SELECT data_items FROM published_stories
        WHERE headline = ${board} AND engine_ref LIKE ${`${prefix}%`}
        ORDER BY run_id DESC, position DESC LIMIT 1
      `
      const lastPrinted = new Map<string, string>()
      if (lastPrintedRow.length > 0 && lastPrintedRow[0]!.data_items !== null) {
        for (const d of JSON.parse(lastPrintedRow[0]!.data_items) as Array<DataItem>) {
          lastPrinted.set(d.label, d.value)
        }
      }
      const withNotes: Array<DataItem> = rows.map(({ label, value }) => {
        const previous = lastPrinted.get(label) ?? null
        if (previous !== value) moved++
        return { label, value, note: motionNote(value, previous) }
      })
      const ref = `${prefix}${day.runId}:${board}`
      const printed = yield* sql<{ one: number }>`
        SELECT 1 AS one FROM published_stories WHERE engine_ref = ${ref} LIMIT 1
      `
      if (printed.length > 0) continue
      boardStories.push(
        editionStoryFrom({
          headline: board,
          body: "",
          differ: "",
          sourcesLine: "",
          balanceNote: null,
          foldReason: null,
          linkByOutlet: new Map(),
          engineRef: ref,
          data: withNotes
        })
      )
      yield* Effect.logInfo(`  board ${board}: ${rows.length} figure(s)`)
    }

    // -- 2. columns -----------------------------------------------------------
    const columnStories: Array<EditionStory> = []
    for (const entry of yield* desk.entries) {
      const ref = `ledger:${slug}:col:${sha256(entry.content)}`
      const printed = yield* sql<{ one: number }>`
        SELECT 1 AS one FROM published_stories WHERE engine_ref = ${ref} LIMIT 1
      `
      if (printed.length > 0) continue
      const { headline, byline, body } = parseColumn(entry)
      columnStories.push(
        editionStoryFrom({
          headline,
          body,
          differ: "",
          sourcesLine: "",
          balanceNote: null,
          foldReason: null,
          linkByOutlet: new Map(),
          engineRef: ref,
          byline
        })
      )
      yield* Effect.logInfo(
        `  column: ${headline.slice(0, 60)}${byline !== null ? ` (by ${byline})` : ""}`
      )
    }

    // -- 3. shelves -----------------------------------------------------------
    const shelfStories: Array<EditionStory> = []
    let posts = 0
    if (feeds.length > 0) {
      const ingested = yield* ingestAllFeeds({ ...day.masthead, source: feeds }, day.runId, everythingIsAPost)
      outcomes.push(...ingested.outcomes)
      const firstSeen = yield* sql<{ link: string }>`
        SELECT link FROM items WHERE run_id = ${day.runId}
      `
      const freshLinks = new Set(firstSeen.map((r) => r.link))
      const fresh = ingested.items.filter((i) => freshLinks.has(i.link))
      for (const { shelf, posts: shelfPosts } of shelve(feeds.map((s) => s.side), fresh)) {
        const ref = `ledger:${slug}:shelf:${day.runId}:${shelf}`
        const printed = yield* sql<{ one: number }>`
          SELECT 1 AS one FROM published_stories WHERE engine_ref = ${ref} LIMIT 1
        `
        if (printed.length > 0) continue
        const rows: Array<LinkItem> = []
        for (const post of shelfPosts) {
          const text =
            outletDeck(post.summary) !== null
              ? null
              : ((yield* fetchAccount(post))?.text ?? null)
          const result = yield* deckFor(
            { outlet: post.outlet, title: post.title, link: post.link, summary: post.summary, text: "" },
            text
          )
          rows.push(toRow(post, result.deck))
        }
        posts += rows.length
        shelfStories.push(
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
    }

    if (decide({ moved, columns: columnStories.length, posts }) === "silence") {
      const reachable = outcomes.filter((o) => o.status === "ok").length
      return {
        _tag: "NoEdition",
        reason: `nothing moved on any board, no new columns, no new posts (${reachable}/${outcomes.length} doors and feeds read)`
      } satisfies EngineOutcome
    }

    const stories = [...boardStories, ...columnStories, ...shelfStories]
    return {
      _tag: "Edition",
      stories,
      report: {
        feedOutcomes: outcomes,
        dropped: [],
        healthLines: [
          `${moved} figure(s) moved across ${boardStories.length} board(s); ` +
            `${columnStories.length} column(s) from the desk; ${posts} new post(s) across ${shelfStories.length} shelf(s).`
        ]
      },
      advisoryLines: []
    } satisfies EngineOutcome
  }).pipe(Effect.withSpan("ledger.edition"))

/** The ledger engine: boards, columns, decked links — the business desk
 * and the sports desk, one engine. */
export const ledgerEngine = {
  name: "ledger",
  doctrine: [
    "The numbers speak; the ledger arranges them. Every figure names its door and shows its motion.",
    "A byline means a human. The press never fakes one.",
    "Every link is the outlet's own door, and its deck adds nothing.",
    "Nothing moved and nothing new, no section. When anything prints, every board prints."
  ],
  models: [MATCH_MODEL],
  edition
} as const
