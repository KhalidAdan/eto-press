/**
 * Stage 8: composite each story's accounts into the four-part brief.
 * The model merges, compresses, attributes — and contributes nothing
 * (NORTH-STAR §4). Drafts are journaled by (cluster_hash, model,
 * prompt_hash, attempt) — the boundary's composite identity — and stage
 * 9's verifier is the cage around this stage. Which accounts go into the
 * ask, and the printed sources line, are this stage's arithmetic; the
 * prompt and the four-part parsing are the inference boundary's.
 */
import { SqlClient } from "@effect/sql"
import { Effect, Schedule } from "effect"
import type { Account, Draft, StoryWithAccounts } from "@eto-press/platform/edition"
import { DraftMalformed } from "@eto-press/platform/errors"
import { Inference } from "@eto-press/platform/inference"

export type { Draft }

/** The production parser, re-exported from its home behind the boundary
 * for lab/composite-eval.ts and the tests. */
export { parseDraft } from "@eto-press/platform/inference-ollama"

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
    const inference = yield* Inference
    const { model, questionHash } = inference.identities.composite
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
        AND model = ${model} AND prompt_hash = ${questionHash}
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
    const inference = yield* Inference
    const { model, questionHash } = inference.identities.composite
    yield* sql`
      INSERT INTO drafts ${sql.insert({
        cluster_hash: clusterHash,
        model,
        prompt_hash: questionHash,
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
    const inference = yield* Inference
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

    const askAccounts = promptAccounts.map((a) => ({
      outlet: a.item.outlet,
      title: a.item.title,
      text: a.text
    }))

    const cached = yield* loadCachedDraft(hash)
    const nextAttempt = cached === null ? 0 : cached.attempt + 1

    for (let attempt = nextAttempt; attempt < nextAttempt + 2; attempt++) {
      const draft = yield* inference
        .composite(askAccounts, {
          attempt,
          revisionNotes: extraNotes,
          unit: `composite ${hash}`
        })
        .pipe(Effect.retry({ schedule: callRetry }))
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
