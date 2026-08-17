/**
 * The wrap engine — the numbers speak, the wrap arranges them.
 *
 * The masthead's sources are boards: the `side` field names the board
 * ("Markets", "Rates", "Weather"), and each feed URL is a data door — a
 * JSON or plain-text endpoint, with an optional `#dot.path` fragment
 * naming the value inside a JSON body:
 *
 *   [[source]]
 *   name = "10Y Treasury"
 *   side = "Rates"
 *   feeds = ["https://api.example.org/rates.json#data.tenYear"]
 *
 * Every morning the engine reads each door, extracts its value, and
 * journals it by content hash through the FrontDoor's document journal —
 * which is also how it knows the PREVIOUS value, so every figure prints
 * with its motion: "4.12 (was 4.25)". A board prints as one data-list
 * story when at least one of its figures moved; a morning where nothing
 * moved anywhere is NoEdition. No models, no charts (figures arrive with
 * the email image pipeline, when wrap papers demand them), no prose the
 * numbers didn't earn.
 */
import { SqlClient } from "@effect/sql"
import { Effect } from "effect"
import { createHash } from "node:crypto"
import { editionStoryFrom, type DataItem, type EditionStory } from "@eto-press/platform/edition"
import type { Day, EngineOutcome } from "@eto-press/platform/engine"
import type { FeedOutcome } from "@eto-press/platform/feeds"
import { fetchRaw, recordDocument, valueAtPath } from "@eto-press/platform/frontdoor"

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex")

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
    const magnitude = Math.abs(delta) < 1 ? delta.toFixed(2).replace(/0+$/, "").replace(/\.$/, "") : String(Math.round(delta * 100) / 100)
    return `${delta > 0 ? "▲ +" : "▼ "}${magnitude} since last edition`
  }
  return `was ${previous}`
}

const edition = (day: Day) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const boards = new Map<string, Array<{ label: string; value: string }>>()
    const outcomes: Array<FeedOutcome> = []

    for (const source of day.masthead.source) {
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
        // The document journal records every sighting (the audit trail);
        // the motion DECISION is made against the store below — what the
        // reader last saw, not what the engine last fetched.
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

    // Motion is measured against the last PRINTED figures — the store's
    // truth. A morning that saw movement but never printed does not
    // consume it; the movement prints on the next successful morning
    // (the same self-heal the desk and letter engines settled on).
    let moved = 0
    const noted = new Map<string, Array<DataItem>>()
    for (const [board, rows] of boards) {
      const lastPrintedRow = yield* sql<{ data_items: string | null }>`
        SELECT data_items FROM published_stories
        WHERE headline = ${board} AND engine_ref LIKE 'wrap:%'
        ORDER BY run_id DESC, position DESC LIMIT 1
      `
      const lastPrinted = new Map<string, string>()
      if (lastPrintedRow.length > 0 && lastPrintedRow[0]!.data_items !== null) {
        for (const d of JSON.parse(lastPrintedRow[0]!.data_items) as Array<DataItem>) {
          lastPrinted.set(d.label, d.value)
        }
      }
      const withNotes = rows.map(({ label, value }) => {
        const previous = lastPrinted.get(label) ?? null
        if (previous !== value) moved++
        return { label, value, note: motionNote(value, previous) }
      })
      noted.set(board, withNotes)
    }

    // Motion is decided morning-wide below: a board with no motion still
    // prints when the morning prints at all — the wrap shows the whole
    // state of the world it watches, not just the parts that twitched.
    const stories: Array<EditionStory> = []
    for (const [board, rows] of noted) {
      const ref = `wrap:${day.runId}:${board}`
      const printed = yield* sql<{ one: number }>`
        SELECT 1 AS one FROM published_stories WHERE engine_ref = ${ref} LIMIT 1
      `
      if (printed.length > 0) continue
      stories.push(
        editionStoryFrom({
          headline: board,
          body: "",
          differ: "",
          sourcesLine: "",
          balanceNote: null,
          foldReason: null,
          linkByOutlet: new Map(),
          engineRef: ref,
          data: rows
        })
      )
      yield* Effect.logInfo(`  board ${board}: ${rows.length} figure(s)`)
    }

    if (moved === 0 || stories.length === 0) {
      const reachable = outcomes.filter((o) => o.status === "ok").length
      return {
        _tag: "NoEdition",
        reason: `nothing moved on any board (${reachable}/${outcomes.length} doors read)`
      } satisfies EngineOutcome
    }

    return {
      _tag: "Edition",
      stories,
      report: {
        feedOutcomes: outcomes,
        dropped: [],
        healthLines: [
          `${moved} figure(s) moved across ${stories.length} board(s). The numbers speak; the wrap arranges them.`
        ]
      },
      advisoryLines: []
    } satisfies EngineOutcome
  }).pipe(Effect.withSpan("wrap.edition"))

/** The wrap engine: labeled figures, their motion, and nothing else. */
export const wrapEngine = {
  name: "wrap",
  doctrine: [
    "The numbers speak; the wrap arranges them.",
    "Every figure names its door and shows its motion.",
    "Nothing moved, no edition. A flat morning is a quiet inbox."
  ],
  models: [],
  edition
} as const
