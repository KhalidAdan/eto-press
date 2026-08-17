/**
 * The FrontDoor — polite fetching of source-declared documents.
 *
 * Feeds are one kind of front door; this is the other: an ordinary page
 * an institution serves to ordinary readers — a statement, a decision, a
 * changelog. Same discipline as feeds.ts: honest user-agent, timeouts,
 * transient-only retries, and every distinct version journaled by content
 * hash so an engine can ask "is this new?" and "when did I last see it
 * change?". No disguises, no locks picked (NORTH-STAR §8).
 */
import { HttpClient, HttpClientRequest } from "@effect/platform"
import { SqlClient } from "@effect/sql"
import { Effect, Schedule } from "effect"
import { createHash } from "node:crypto"
import { DocumentUnfetchable } from "./errors.js"
import { USER_AGENT } from "./feeds.js"
import { stripHtml } from "./normalize.js"

export interface FetchedDocument {
  readonly url: string
  readonly title: string | null
  readonly text: string
  readonly contentHash: string
}

/** The page's own name for itself: <title>, else the first heading. */
export const extractTitle = (html: string): string | null => {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  if (title !== undefined && stripHtml(title).length > 0) return stripHtml(title)
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
  if (h1 !== undefined && stripHtml(h1).length > 0) return stripHtml(h1)
  return null
}

/** The page as prose: script/style/nav noise dropped, tags stripped. */
export const documentText = (html: string): string => {
  const withoutBlocks = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
  return stripHtml(withoutBlocks)
}

/** Cap prose on a word boundary, honestly marked. */
export const capText = (text: string, max: number): string => {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const atWord = cut.slice(0, cut.lastIndexOf(" "))
  return `${atWord} […]`
}

const transientRetry = Schedule.exponential("500 millis").pipe(
  Schedule.jittered,
  Schedule.intersect(Schedule.recurs(2))
)

export const fetchDocument = (source: string, url: string) =>
  Effect.gen(function* () {
    const http = (yield* HttpClient.HttpClient).pipe(HttpClient.followRedirects(3))
    const response = yield* http
      .execute(
        HttpClientRequest.get(url).pipe(
          HttpClientRequest.setHeader("User-Agent", USER_AGENT)
        )
      )
      .pipe(
        Effect.timeout("30 seconds"),
        Effect.mapError(
          (cause) => new DocumentUnfetchable({ source, url, cause, transient: true })
        )
      )
    if (response.status >= 400) {
      return yield* new DocumentUnfetchable({
        source,
        url,
        cause: `HTTP ${response.status}`,
        transient: response.status >= 500
      })
    }
    const html = yield* response.text.pipe(
      Effect.mapError(
        (cause) => new DocumentUnfetchable({ source, url, cause, transient: true })
      )
    )
    const text = documentText(html)
    return {
      url,
      title: extractTitle(html),
      text,
      contentHash: createHash("sha256").update(text).digest("hex")
    } satisfies FetchedDocument
  }).pipe(
    Effect.scoped,
    Effect.retry({ schedule: transientRetry, while: (e) => e.transient }),
    Effect.withSpan("frontdoor.fetchDocument", { attributes: { url } })
  )

/** A raw door: the body as served, untouched — for JSON and plain-text
 * data endpoints where HTML prose extraction would mangle the payload. */
export const fetchRaw = (source: string, url: string) =>
  Effect.gen(function* () {
    const http = (yield* HttpClient.HttpClient).pipe(HttpClient.followRedirects(3))
    const response = yield* http
      .execute(
        HttpClientRequest.get(url).pipe(
          HttpClientRequest.setHeader("User-Agent", USER_AGENT)
        )
      )
      .pipe(
        Effect.timeout("30 seconds"),
        Effect.mapError(
          (cause) => new DocumentUnfetchable({ source, url, cause, transient: true })
        )
      )
    if (response.status >= 400) {
      return yield* new DocumentUnfetchable({
        source,
        url,
        cause: `HTTP ${response.status}`,
        transient: response.status >= 500
      })
    }
    return yield* response.text.pipe(
      Effect.mapError(
        (cause) => new DocumentUnfetchable({ source, url, cause, transient: true })
      )
    )
  }).pipe(
    Effect.scoped,
    Effect.retry({ schedule: transientRetry, while: (e) => e.transient }),
    Effect.withSpan("frontdoor.fetchRaw", { attributes: { url } })
  )

/** Pull one value out of a raw body: a dot path into JSON ("data.rate"),
 * or the whole trimmed body when no path is given. Returns null when the
 * path misses or the body isn't JSON but a path was asked for. */
export const valueAtPath = (raw: string, path: string | null): string | null => {
  if (path === null || path === "") return raw.trim() === "" ? null : raw.trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  let cursor: unknown = parsed
  for (const key of path.split(".")) {
    if (cursor === null || typeof cursor !== "object") return null
    cursor = (cursor as Record<string, unknown>)[key]
  }
  if (cursor === undefined || cursor === null) return null
  return typeof cursor === "string" ? cursor : JSON.stringify(cursor)
}

/** Journal the fetched version. Returns whether this content is new for
 * the url, and the previously seen version if any — the engine's "what
 * did this door last say, and when?". */
export const recordDocument = (runId: string, doc: FetchedDocument) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const previous = yield* sql<{ content_hash: string; fetched_at: string; text: string }>`
      SELECT content_hash, fetched_at, text FROM documents
      WHERE url = ${doc.url} ORDER BY fetched_at DESC LIMIT 1
    `
    const isNew = previous.length === 0 || previous[0]!.content_hash !== doc.contentHash
    if (isNew) {
      yield* sql`INSERT INTO documents ${sql.insert({
        url: doc.url,
        content_hash: doc.contentHash,
        run_id: runId,
        title: doc.title,
        text: doc.text,
        fetched_at: new Date().toISOString()
      })} ON CONFLICT (url, content_hash) DO NOTHING`
    }
    return {
      isNew,
      previous: previous.length > 0
        ? {
            contentHash: previous[0]!.content_hash,
            fetchedAt: previous[0]!.fetched_at,
            text: previous[0]!.text
          }
        : null
    }
  }).pipe(Effect.withSpan("frontdoor.recordDocument"))
