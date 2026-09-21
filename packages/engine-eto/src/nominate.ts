/**
 * Stage 6b: the below-the-fold nomination (experiment 003's one survivor).
 *
 * Human-centric by construction:
 * - The pool is ONLY clusters the front page didn't select — the model can
 *   add one story; it can never reorder or displace the main eight.
 * - The nomination reason is printed verbatim in the brief. The editor
 *   grades it by reading. If the reasons read like headline echoes, the
 *   editor sets `below_the_fold = false` in sources.toml and it is gone.
 * - Candidates are shuffled (003 run 1: position bias will silently eat a
 *   lazy ranking prompt).
 * - No nomination is a fine outcome: on any failure the brief simply has
 *   no below-the-fold today, and the report says so.
 *
 * The deck — pool, shuffle, labels — is this stage's; how the question is
 * put to a model is the inference boundary's.
 */
import { Effect, Schedule } from "effect"
import { Inference } from "@eto-press/platform/inference"
import type { Cluster } from "./cluster.js"

/** The production parser, re-exported from its home behind the boundary
 * for the tests and probes that grade it. */
export { parseNomination } from "@eto-press/platform/inference-ollama"

export interface Nomination {
  readonly cluster: Cluster
  readonly reason: string
}

const shuffled = <T>(arr: ReadonlyArray<T>, seed: number): Array<T> => {
  const out = [...arr]
  let s = seed || 1
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 48271) % 2147483647
    const j = s % (i + 1)
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

export const nominateBelowTheFold = (
  pool: ReadonlyArray<Cluster>,
  runId: string
) =>
  Effect.gen(function* () {
    if (pool.length === 0) return null
    const inference = yield* Inference

    const seed = [...runId].reduce((n, ch) => n * 31 + ch.charCodeAt(0), 7)
    const deck = shuffled(pool, seed).map((c, i) => ({
      id: `c${i + 1}`,
      cluster: c,
      line:
        `c${i + 1} [${c.sides.join("/")}] (${c.outlets.length} outlets): ` +
        c.items.slice(0, 2).map((it) => it.title).join(" | ")
    }))

    const { pick, raw } = yield* inference
      .nominate(
        deck.map((d) => ({ id: d.id, line: d.line })),
        "below-the-fold nomination"
      )
      .pipe(
        Effect.retry({
          schedule: Schedule.exponential("1 second").pipe(
            Schedule.jittered,
            Schedule.intersect(Schedule.recurs(1))
          )
        })
      )

    if (pick === null) {
      yield* Effect.logWarning(`below-the-fold: unparseable nomination: ${raw.slice(0, 80)}`)
      return null
    }
    const picked = deck.find((d) => d.id === pick.id)
    if (picked === undefined) {
      yield* Effect.logWarning(`below-the-fold: nominated unknown id ${pick.id}`)
      return null
    }
    return { cluster: picked.cluster, reason: pick.reason } satisfies Nomination
  }).pipe(Effect.withSpan("stage6b.nominateBelowTheFold"))
