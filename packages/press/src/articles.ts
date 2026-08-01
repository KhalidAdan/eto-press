/**
 * Stage 7: fetch the full article behind each selected story's items.
 * Front door, honest UA, per-request politeness delay. An account that
 * cannot be fetched drops out of the composite — the sources line names
 * only accounts actually read (NORTH-STAR §3). A story below 2 fetched
 * accounts is dropped, and the drop is reported (§5).
 */
import { HttpClient, HttpClientRequest } from "@effect/platform"
import { SqlClient } from "@effect/sql"
import { Readability } from "@mozilla/readability"
import { Effect, Schedule } from "effect"
import { JSDOM, VirtualConsole } from "jsdom"
import { ArticleUnfetchable, ArticleUnreadable } from "./errors.js"
import { USER_AGENT } from "./feeds.js"
import type { Item } from "./normalize.js"
import type { Story } from "./select.js"

const POLITENESS_MS = 300
const MAX_STORED_CHARS = 20_000

/** Known text-only front doors (experiment 001: npr.org timed out twice
 * while text.npr.org served the full article instantly). */
export const mirrorUrl = (link: string): string | null => {
  const npr = link.match(/npr\.org\/\d{4}\/\d{2}\/\d{2}\/([a-z0-9-]+)\//i)
  if (npr) return `https://text.npr.org/${npr[1]}`
  return null
}

const transientRetry = Schedule.exponential("500 millis").pipe(
  Schedule.jittered,
  Schedule.intersect(Schedule.recurs(2))
)

const fetchHtml = (item: Item, url: string) =>
  Effect.gen(function* () {
    const http = (yield* HttpClient.HttpClient).pipe(HttpClient.followRedirects(3))
    const response = yield* http.execute(
      HttpClientRequest.get(url).pipe(
        HttpClientRequest.setHeader("User-Agent", USER_AGENT)
      )
    ).pipe(
      Effect.timeout("30 seconds"),
      Effect.mapError(
        (cause) =>
          new ArticleUnfetchable({ outlet: item.outlet, url, cause, transient: true })
      )
    )
    if (response.status >= 400) {
      return yield* new ArticleUnfetchable({
        outlet: item.outlet,
        url,
        cause: `HTTP ${response.status}`,
        transient: response.status >= 500
      })
    }
    return yield* response.text.pipe(
      Effect.mapError(
        (cause) =>
          new ArticleUnfetchable({ outlet: item.outlet, url, cause, transient: true })
      )
    )
  }).pipe(
    Effect.scoped,
    Effect.retry({ schedule: transientRetry, while: (e) => e.transient })
  )

/** Readability-style extraction; jsdom's own noise is swallowed. Also
 * captures the outlet's designated link-preview image (og:image). */
const extractText = (item: Item, url: string, html: string) =>
  Effect.try({
    try: () => {
      const virtualConsole = new VirtualConsole()
      virtualConsole.on("jsdomError", () => {})
      const dom = new JSDOM(html, { url, virtualConsole })
      const ogImage =
        dom.window.document
          .querySelector('meta[property="og:image"], meta[name="twitter:image"]')
          ?.getAttribute("content")
          ?.trim() ?? null
      const article = new Readability(dom.window.document).parse()
      const text = (article?.textContent ?? "").replace(/\s+/g, " ").trim()
      if (text.length < 300) throw new Error("extraction too short")
      return {
        text: text.slice(0, MAX_STORED_CHARS),
        ogImage: ogImage?.startsWith("http") ? ogImage : null
      }
    },
    catch: () => new ArticleUnreadable({ outlet: item.outlet, url: item.link })
  })

const fetchArticle = (item: Item) =>
  Effect.gen(function* () {
    // Prefer the text mirror when one exists — it IS a front door.
    const mirror = mirrorUrl(item.link)
    if (mirror !== null) {
      const viaMirror = yield* fetchHtml(item, mirror).pipe(
        Effect.flatMap((html) => extractText(item, mirror, html)),
        Effect.either
      )
      if (viaMirror._tag === "Right") return viaMirror.right
    }
    const html = yield* fetchHtml(item, item.link)
    return yield* extractText(item, item.link, html)
  }).pipe(
    Effect.withSpan("stage7.fetchArticle", {
      attributes: { outlet: item.outlet, url: item.link }
    })
  )

export interface Account {
  readonly item: Item
  readonly text: string
}

export interface StoryWithAccounts {
  readonly story: Story
  readonly accounts: ReadonlyArray<Account>
}

/** Fetch every account of every story. Cached by item id: a rerun refetches
 * only what is missing or previously failed. */
export const fetchArticlesForStories = (
  stories: ReadonlyArray<Story>
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const out: Array<StoryWithAccounts> = []
    let fetched = 0
    let cached = 0
    let failed = 0

    for (const story of stories) {
      const accounts: Array<Account> = []
      for (const item of story.cluster.items) {
        const rows = yield* sql<{ status: string; text: string | null }>`
          SELECT status, text FROM articles WHERE item_id = ${item.id}
        `
        if (rows[0]?.status === "ok" && rows[0].text) {
          accounts.push({ item, text: rows[0].text })
          cached++
          continue
        }

        yield* Effect.sleep(`${POLITENESS_MS} millis`)
        const result = yield* fetchArticle(item).pipe(Effect.either)
        if (result._tag === "Right") {
          yield* sql`
            INSERT OR REPLACE INTO articles ${sql.insert({
              item_id: item.id,
              status: "ok",
              http_code: 200,
              text: result.right.text,
              og_image: result.right.ogImage,
              fetched_at: new Date().toISOString()
            })}
          `
          accounts.push({ item, text: result.right.text })
          fetched++
        } else {
          const err = result.left
          yield* sql`
            INSERT OR REPLACE INTO articles ${sql.insert({
              item_id: item.id,
              status: err._tag === "ArticleUnreadable" ? "unreadable" : "unfetchable",
              http_code: null,
              text: null,
              fetched_at: new Date().toISOString()
            })}
          `
          yield* Effect.logWarning(
            `  account dropped: ${item.outlet} — ${err._tag} (${item.link.slice(0, 70)})`
          )
          failed++
        }
      }
      out.push({ story, accounts })
    }

    yield* Effect.logInfo(
      `stage 7: ${fetched} articles fetched, ${cached} from journal, ${failed} accounts dropped`
    )
    return out
  }).pipe(Effect.withSpan("stage7.fetchArticlesForStories"))
