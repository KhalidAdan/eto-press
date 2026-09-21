/**
 * Stage 4: judge candidate pairs — same news event, yes or no.
 *
 * The verdicts table's primary key (item_a, item_b, model, prompt_hash) is
 * the resume story of the whole pipeline: a rerun skips every judged pair,
 * and changing the model or the question spec automatically re-judges. A
 * crash costs the one pair in flight. The key's values come from the
 * inference boundary's identities — this stage never sees a prompt.
 */
import { SqlClient } from "@effect/sql"
import { Effect, Schedule } from "effect"
import { VerdictsSuspicious } from "@eto-press/platform/errors"
import { Inference } from "@eto-press/platform/inference"
import type { CandidatePair } from "./prefilter.js"

/** The production parser, re-exported from its home behind the boundary
 * for lab/judge-eval.ts — candidates must be graded by the same parser
 * production uses. */
export { parseVerdict } from "@eto-press/platform/inference-ollama"

export interface JudgedPair {
  readonly pair: CandidatePair
  readonly same: boolean
  readonly cached: boolean
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
    const inference = yield* Inference
    const { model, questionHash } = inference.identities.sameEvent

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
          AND model = ${model} AND prompt_hash = ${questionHash}
      `
      if (existing.length > 0) {
        results.push({ pair, same: existing[0]!.answer === "yes", cached: true })
        continue
      }

      const askOnce = inference
        .sameEvent(pair.a, pair.b, `pair ${pairId}`)
        .pipe(Effect.retry({ schedule: callRetry }))

      const t0 = Date.now()
      let verdict = yield* askOnce
      if (verdict.answer === null) {
        // One re-ask, then record an abstention — visible, not silent.
        verdict = yield* askOnce
      }
      const answer = verdict.answer ?? "abstain"

      yield* sql`INSERT INTO verdicts ${sql.insert({
        item_a: lo,
        item_b: hi,
        model,
        prompt_hash: questionHash,
        answer,
        confidence: verdict.confidence,
        raw: verdict.raw.slice(0, 200),
        ms: Date.now() - t0,
        judged_at: new Date().toISOString()
      })} ON CONFLICT (item_a, item_b, model, prompt_hash) DO NOTHING`

      if (answer === "abstain") {
        abstained++
        yield* Effect.logWarning(
          `verdict unparseable for pair ${pairId}: ${verdict.raw.slice(0, 60)}`
        )
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
