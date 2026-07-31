/**
 * Stage 4: judge candidate pairs — same news event, yes or no.
 *
 * The verdicts table's primary key (item_a, item_b, model, prompt_hash) is
 * the resume story of the whole pipeline: a rerun skips every judged pair,
 * and changing the model or prompt automatically re-judges. A crash costs
 * the one pair in flight.
 */
import { SqlClient } from "@effect/sql"
import { Effect, Schedule } from "effect"
import { MATCH_MODEL } from "./config.js"
import { VerdictsSuspicious } from "./errors.js"
import type { CandidatePair } from "./prefilter.js"
import { Ollama } from "./ollama.js"
import { SAME_EVENT_PROMPT_HASH, sameEventPrompt } from "./prompts.js"

export interface JudgedPair {
  readonly pair: CandidatePair
  readonly same: boolean
  readonly cached: boolean
}

/** The verdict is the last word of the completion, whatever else came out.
 * Exported for lab/judge-eval.ts: candidates must be graded by the same
 * parser production uses. */
export const parseVerdict = (raw: string): "yes" | "no" | null => {
  const afterThink = raw.includes("</think>")
    ? raw.slice(raw.lastIndexOf("</think>") + 8)
    : raw
  const words = afterThink.toLowerCase().match(/[a-z]+/g)
  const last = words?.at(-1)
  return last === "yes" || last === "no" ? last : null
}

const callRetry = Schedule.exponential("1 second").pipe(
  Schedule.jittered,
  Schedule.intersect(Schedule.recurs(2))
)

/** Tripwire threshold: a unanimous first-N verdict stream means the prompt
 * or model is broken; stop the press before wasting the rest of the run. */
const TRIPWIRE_AT = 100

export const judgePairs = (pairs: ReadonlyArray<CandidatePair>) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const ollama = yield* Ollama

    const results: Array<JudgedPair> = []
    let fresh = 0
    let freshYes = 0
    let freshNo = 0
    let abstained = 0
    const started = Date.now()

    for (const pair of pairs) {
      const [lo, hi] =
        pair.a.id < pair.b.id ? [pair.a.id, pair.b.id] : [pair.b.id, pair.a.id]
      const pairId = `${lo}-${hi}`

      const existing = yield* sql<{ answer: string }>`
        SELECT answer FROM verdicts
        WHERE item_a = ${lo} AND item_b = ${hi}
          AND model = ${MATCH_MODEL} AND prompt_hash = ${SAME_EVENT_PROMPT_HASH}
      `
      if (existing.length > 0) {
        results.push({ pair, same: existing[0]!.answer === "yes", cached: true })
        continue
      }

      const prompt = sameEventPrompt(pair.a, pair.b)
      const askOnce = ollama
        .chat(MATCH_MODEL, prompt, `pair ${pairId}`)
        .pipe(Effect.retry({ schedule: callRetry }))

      const t0 = Date.now()
      let raw = yield* askOnce
      let verdict = parseVerdict(raw)
      if (verdict === null) {
        // One re-ask, then record an abstention — visible, not silent.
        raw = yield* askOnce
        verdict = parseVerdict(raw)
      }
      const answer = verdict ?? "abstain"

      yield* sql`INSERT INTO verdicts ${sql.insert({
        item_a: lo,
        item_b: hi,
        model: MATCH_MODEL,
        prompt_hash: SAME_EVENT_PROMPT_HASH,
        answer,
        raw: raw.slice(0, 200),
        ms: Date.now() - t0,
        judged_at: new Date().toISOString()
      })} ON CONFLICT (item_a, item_b, model, prompt_hash) DO NOTHING`

      if (answer === "abstain") {
        abstained++
        yield* Effect.logWarning(`verdict unparseable for pair ${pairId}: ${raw.slice(0, 60)}`)
      }
      results.push({ pair, same: answer === "yes", cached: false })
      fresh++
      if (answer === "yes") freshYes++
      if (answer === "no") freshNo++

      if (fresh === TRIPWIRE_AT && (freshYes === 0 || freshNo === 0)) {
        return yield* new VerdictsSuspicious({
          judged: fresh,
          yes: freshYes,
          no: freshNo,
          reason:
            "first fresh verdicts are unanimous — prompt or model is broken " +
            "(experiment 002 failure mode). Run `npm run probe`."
        })
      }

      if (fresh % 25 === 0) {
        const rate = fresh / ((Date.now() - started) / 1000)
        yield* Effect.logInfo(
          `judged ${fresh} fresh pairs (${freshYes} yes, ${abstained} abstain, ${rate.toFixed(1)}/s)`
        )
      }
    }

    const cached = results.length - fresh
    yield* Effect.logInfo(
      `stage 4: ${results.length} pairs — ${cached} from journal, ${fresh} fresh ` +
        `(${freshYes} yes, ${freshNo} no, ${abstained} abstain)`
    )
    return results
  }).pipe(Effect.withSpan("stage4.judgePairs"))
