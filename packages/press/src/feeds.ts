/**
 * Stage 1: fetch feeds through the front door with an honest user-agent.
 * Stage 2: parse, normalize, classify, persist (INSERT OR IGNORE on link).
 * A failed feed never kills the run — the outlet is absent, the absence is
 * recorded in feed_fetches, and the editor hears about it in the report.
 */
import { HttpClient, HttpClientRequest } from "@effect/platform"
import { SqlClient } from "@effect/sql"
import { Effect, Schedule } from "effect"
import Parser from "rss-parser"
import { FeedMalformed, FeedUnreachable } from "./errors.js"
import type { Masthead, Source } from "./masthead.js"
import { classify, stripHtml, type Item } from "./normalize.js"

export const USER_AGENT =
  "eto/0.1 (+local news compositor; front-door reader)"

export const WINDOW_HOURS = 48

const parser = new Parser()

const transientRetry = Schedule.exponential("500 millis").pipe(
  Schedule.jittered,
  Schedule.intersect(Schedule.recurs(2))
)

const fetchBody = (outlet: Source, url: string) =>
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient
    const request = HttpClientRequest.get(url).pipe(
      HttpClientRequest.setHeader("User-Agent", USER_AGENT)
    )
    const response = yield* http.execute(request).pipe(
      Effect.timeout("30 seconds"),
      Effect.mapError(
        (cause) =>
          new FeedUnreachable({ outlet: outlet.name, url, cause, transient: true })
      )
    )
    if (response.status >= 400) {
      return yield* new FeedUnreachable({
        outlet: outlet.name,
        url,
        cause: `HTTP ${response.status}`,
        transient: response.status >= 500
      })
    }
    const body = yield* response.text.pipe(
      Effect.mapError(
        (cause) =>
          new FeedUnreachable({ outlet: outlet.name, url, cause, transient: true })
      )
    )
    return { body, status: response.status }
  }).pipe(
    Effect.scoped,
    Effect.retry({ schedule: transientRetry, while: (e) => e.transient }),
    Effect.withSpan("stage1.fetchFeed", { attributes: { outlet: outlet.name, url } })
  )

interface RawEntry {
  readonly title: string
  readonly summary: string
  readonly link: string
  readonly publishedAt: Date
}

const parseEntries = (outlet: Source, url: string, xml: string) =>
  Effect.tryPromise({
    try: () => parser.parseString(xml),
    catch: (cause) => new FeedMalformed({ outlet: outlet.name, url, cause })
  }).pipe(
    Effect.map((feed) => {
      const cutoff = Date.now() - WINDOW_HOURS * 3600 * 1000
      const entries: Array<RawEntry> = []
      for (const e of feed.items ?? []) {
        const link = e.link?.trim()
        const title = e.title?.trim()
        const published = e.isoDate ?? e.pubDate
        if (!link || !title || !published) continue
        const at = new Date(published)
        if (Number.isNaN(at.getTime()) || at.getTime() < cutoff) continue
        entries.push({
          title,
          link,
          publishedAt: at,
          summary: stripHtml(e.contentSnippet ?? e.content ?? e.summary ?? "").slice(0, 500)
        })
      }
      return entries
    })
  )

export interface FeedOutcome {
  readonly outlet: string
  readonly url: string
  readonly status: "ok" | "unreachable" | "malformed"
  readonly itemsKept: number
  readonly ms: number
  readonly detail: string | null
}

/**
 * Fetch + normalize + persist every feed in the masthead. Returns the run's
 * in-window items (deduplicated by link) and a per-feed outcome list.
 */
export const ingestAllFeeds = (masthead: Masthead, runId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const outcomes: Array<FeedOutcome> = []
    const byLink = new Map<string, Item>()

    for (const source of masthead.source) {
      for (const url of source.feeds) {
        const started = Date.now()
        const result = yield* fetchBody(source, url).pipe(
          Effect.flatMap(({ body }) => parseEntries(source, url, body)),
          Effect.either
        )
        const ms = Date.now() - started

        if (result._tag === "Left") {
          const err = result.left
          outcomes.push({
            outlet: source.name,
            url,
            status: err._tag === "FeedMalformed" ? "malformed" : "unreachable",
            itemsKept: 0,
            ms,
            detail: String(err.cause)
          })
          yield* Effect.logWarning(`feed failed: ${source.name} ${url} (${err._tag})`)
          continue
        }

        let kept = 0
        for (const entry of result.right) {
          if (byLink.has(entry.link)) continue
          yield* sql`
            INSERT INTO items ${sql.insert({
              run_id: runId,
              outlet: source.name,
              side: source.side,
              kind: classify(entry.title, entry.link),
              title: entry.title,
              summary: entry.summary,
              link: entry.link,
              published_at: entry.publishedAt.toISOString()
            })}
            ON CONFLICT (link) DO UPDATE SET
              side = excluded.side,
              kind = excluded.kind
          `
          kept++
        }
        outcomes.push({
          outlet: source.name, url, status: "ok", itemsKept: kept, ms, detail: null
        })
      }
    }

    // Read the window back from the journal — items may have been first seen
    // by an earlier run today; the journal, not this process, is the truth.
    const cutoffIso = new Date(Date.now() - WINDOW_HOURS * 3600 * 1000).toISOString()
    const rows = yield* sql<{
      id: number
      outlet: string
      side: string
      kind: string
      title: string
      summary: string
      link: string
      published_at: string
    }>`SELECT * FROM items WHERE published_at >= ${cutoffIso}`

    for (const r of rows) {
      byLink.set(r.link, {
        id: r.id,
        outlet: r.outlet,
        side: r.side,
        // Classification is derived, not journaled truth: recompute so a
        // classifier fix reaches items ingested before it (the stored kind
        // remains as the ingest-time record).
        kind: classify(r.title, r.link),
        title: r.title,
        summary: r.summary,
        link: r.link,
        publishedAt: new Date(r.published_at)
      })
    }

    for (const o of outcomes) {
      yield* sql`INSERT INTO feed_fetches ${sql.insert({
        run_id: runId,
        outlet: o.outlet,
        url: o.url,
        status: o.status,
        http_code: null,
        ms: o.ms,
        items_kept: o.itemsKept,
        detail: o.detail,
        fetched_at: new Date().toISOString()
      })}`
    }

    return { items: [...byLink.values()], outcomes }
  }).pipe(Effect.withSpan("stage1-2.ingestAllFeeds"))
