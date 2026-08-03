/**
 * Stage 8: composite each story's accounts into the four-part brief.
 * The model merges, compresses, attributes — and contributes nothing
 * (NORTH-STAR §4). Drafts are journaled by (cluster_hash, model,
 * prompt_hash, attempt); stage 9's verifier is the cage around this stage.
 */
import { SqlClient } from "@effect/sql"
import { Effect, Schedule } from "effect"
import type { Account, StoryWithAccounts } from "./articles.js"
import { COMPOSITE_MODEL, COMPOSITE_NUM_CTX } from "./config.js"
import { DraftMalformed } from "./errors.js"
import { Ollama } from "./ollama.js"
import { COMPOSITE_PROMPT_HASH, compositePrompt } from "./prompts.js"

export interface Draft {
  readonly headline: string
  readonly body: string
  readonly differ: string
  readonly sourcesLine: string
  readonly raw: string
  readonly attempt: number
}

/** Pure and testable: pull the four parts out of the model's text, or null.
 * Tolerates markdown bolding and heading marks around the markers. */
export const parseDraft = (raw: string, attempt: number): Draft | null => {
  const cleaned = raw.replace(/\*\*/g, "").replace(/^#+\s*/gm, "")
  const grab = (start: string, enders: ReadonlyArray<string>): string | null => {
    const re = new RegExp(`^\\s*${start}\\s*:?\\s*`, "im")
    const m = re.exec(cleaned)
    if (!m) return null
    const from = m.index + m[0].length
    let to = cleaned.length
    for (const end of enders) {
      const er = new RegExp(`^\\s*${end}\\s*:?`, "im")
      const em = er.exec(cleaned.slice(from))
      if (em && from + em.index < to) to = from + em.index
    }
    return cleaned.slice(from, to).trim()
  }

  const headline = grab("HEADLINE", ["BODY"])
  const body = grab("BODY", ["WHERE THE ACCOUNTS DIFFER"])
  const differ = grab("WHERE THE ACCOUNTS DIFFER", ["SOURCES"])
  const sourcesLine = grab("SOURCES", [])

  if (!headline || !body || !differ || !sourcesLine) return null
  // SOURCES is the last line; anything substantial after it violates "it ends".
  if (sourcesLine.split("\n").length > 2) return null
  return { headline, body, differ, sourcesLine, raw, attempt }
}

/** The context window is finite; a 9-account cluster is not. One account
 * per outlet first (longest text wins), then extras by length, capped. */
export const MAX_PROMPT_ACCOUNTS = 6

// The catalog's stage-8 contract (PIPELINE.md): OllamaCallFailed retries
// 3× with backoff — the server may be reloading a model — before the
// failure escalates to the caller.
const callRetry = Schedule.exponential("1 second").pipe(
  Schedule.jittered,
  Schedule.intersect(Schedule.recurs(2))
)

/** The sources line is arithmetic, not prose: exactly the outlets whose
 * accounts were in the prompt (NORTH-STAR §3 — only accounts actually
 * read). The model still emits a SOURCES section as a format anchor, but
 * its content is discarded — an 8B model attributing its own reading is a
 * hallucination surface, not a record. */
export const sourcesLineFor = (
  promptAccounts: ReadonlyArray<Account>
): string =>
  [...new Set(promptAccounts.map((a) => a.item.outlet))].join(" - ")

export const selectAccountsForPrompt = (
  accounts: ReadonlyArray<Account>
): ReadonlyArray<Account> => {
  const byOutlet = new Map<string, Account>()
  for (const a of accounts) {
    const cur = byOutlet.get(a.item.outlet)
    if (!cur || a.text.length > cur.text.length) byOutlet.set(a.item.outlet, a)
  }
  const primary = [...byOutlet.values()]
  const rest = accounts
    .filter((a) => !primary.includes(a))
    .sort((a, b) => b.text.length - a.text.length)
  return [...primary, ...rest].slice(0, MAX_PROMPT_ACCOUNTS)
}

const loadCachedDraft = (clusterHash: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<{
      headline: string
      body: string
      differ: string
      sources_line: string
      raw: string
      attempt: number
    }>`
      SELECT headline, body, differ, sources_line, raw, attempt FROM drafts
      WHERE cluster_hash = ${clusterHash}
        AND model = ${COMPOSITE_MODEL} AND prompt_hash = ${COMPOSITE_PROMPT_HASH}
      ORDER BY attempt DESC LIMIT 1
    `
    const r = rows[0]
    return r === undefined
      ? null
      : {
          headline: r.headline,
          body: r.body,
          differ: r.differ,
          sourcesLine: r.sources_line,
          raw: r.raw,
          attempt: r.attempt
        }
  })

export const persistDraft = (clusterHash: string, draft: Draft) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      INSERT INTO drafts ${sql.insert({
        cluster_hash: clusterHash,
        model: COMPOSITE_MODEL,
        prompt_hash: COMPOSITE_PROMPT_HASH,
        attempt: draft.attempt,
        headline: draft.headline,
        body: draft.body,
        differ: draft.differ,
        sources_line: draft.sourcesLine,
        raw: draft.raw,
        created_at: new Date().toISOString()
      })} ON CONFLICT (cluster_hash, model, prompt_hash, attempt) DO NOTHING
    `
  })

/** Generate (or reuse) a draft for one story. Fails with DraftMalformed
 * after two shapeless attempts — the story drops, never the run. */
export const compositeStory = (swa: StoryWithAccounts, extraNotes?: string) =>
  Effect.gen(function* () {
    const ollama = yield* Ollama
    const hash = swa.story.cluster.hash
    const promptAccounts = selectAccountsForPrompt(swa.accounts)
    // Applied on every return path, including journal reloads: drafts
    // journal what the model wrote, but the printed line is computed.
    const withSources = (draft: Draft): Draft => ({
      ...draft,
      sourcesLine: sourcesLineFor(promptAccounts)
    })

    if (extraNotes === undefined) {
      const cached = yield* loadCachedDraft(hash)
      if (cached !== null) {
        yield* Effect.logInfo(
          `  draft from journal (attempt ${cached.attempt}): ${cached.headline.slice(0, 60)}`
        )
        return withSources(cached)
      }
    }

    const basePrompt = compositePrompt(
      promptAccounts.map((a) => ({
        outlet: a.item.outlet,
        title: a.item.title,
        text: a.text
      }))
    )
    const prompt =
      extraNotes === undefined
        ? basePrompt
        : `${basePrompt}\n\nEDITOR'S NOTES on your previous draft — fix these and output the corrected brief in full:\n${extraNotes}`

    const cached = yield* loadCachedDraft(hash)
    const nextAttempt = cached === null ? 0 : cached.attempt + 1

    for (let attempt = nextAttempt; attempt < nextAttempt + 2; attempt++) {
      const raw = yield* ollama.chat(COMPOSITE_MODEL, prompt, `composite ${hash}`, {
        numCtx: COMPOSITE_NUM_CTX,
        think: false
      }).pipe(Effect.retry({ schedule: callRetry }))
      const draft = parseDraft(raw, attempt)
      if (draft !== null) {
        yield* persistDraft(hash, draft)
        return withSources(draft)
      }
      yield* Effect.logWarning(`  draft malformed (attempt ${attempt}), re-asking`)
    }
    return yield* new DraftMalformed({ clusterHash: hash, raw: "two shapeless attempts" })
  }).pipe(
    Effect.withSpan("stage8.compositeStory", {
      attributes: { cluster: swa.story.cluster.hash }
    })
  )
