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
 */
import { Effect, Schedule } from "effect"
import type { Cluster } from "./cluster.js"
import { COMPOSITE_MODEL } from "./config.js"
import { Ollama } from "./ollama.js"

export interface Nomination {
  readonly cluster: Cluster
  readonly reason: string
}

/** Pure and probed: pull "cX — reason" out of the model's reply. */
export const parseNomination = (
  raw: string
): { id: string; reason: string } | null => {
  const m = raw.match(/\b(c\d+)\s*[—–:-]+\s*(.+)/s)
  if (!m) return null
  const reason = m[2]!.split(/\n/)[0]!.trim()
  return reason.length < 10 ? null : { id: m[1]!, reason }
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
    const ollama = yield* Ollama

    const seed = [...runId].reduce((n, ch) => n * 31 + ch.charCodeAt(0), 7)
    const deck = shuffled(pool, seed).map((c, i) => ({
      id: `c${i + 1}`,
      cluster: c,
      line:
        `c${i + 1} [${c.sides.join("/")}] (${c.outlets.length} outlets): ` +
        c.items.slice(0, 2).map((it) => it.title).join(" | ")
    }))

    const prompt =
      "You are the editor's scout for a daily news brief. The front page is " +
      "already chosen; you cannot change it. Below, in random order, are the " +
      "day's remaining multi-outlet stories — candidates for ONE 'below the " +
      "fold' slot: a story whose real-world consequence exceeds the " +
      "attention it got. Prefer concrete consequence for many people " +
      "(health, money, rights, safety, war and peace). Avoid celebrity, " +
      "sports, punditry, and palace politics.\n\n" +
      deck.map((d) => d.line).join("\n") +
      "\n\nOutput exactly one line, nothing else:\n" +
      "cX — one sentence naming the concrete consequence that earns the slot\n"

    const raw = yield* ollama
      .chat(COMPOSITE_MODEL, prompt, "below-the-fold nomination", { numCtx: 8192 })
      .pipe(
        Effect.retry({
          schedule: Schedule.exponential("1 second").pipe(
            Schedule.jittered,
            Schedule.intersect(Schedule.recurs(1))
          )
        })
      )

    const parsed = parseNomination(raw)
    if (parsed === null) {
      yield* Effect.logWarning(`below-the-fold: unparseable nomination: ${raw.slice(0, 80)}`)
      return null
    }
    const picked = deck.find((d) => d.id === parsed.id)
    if (picked === undefined) {
      yield* Effect.logWarning(`below-the-fold: nominated unknown id ${parsed.id}`)
      return null
    }
    return { cluster: picked.cluster, reason: parsed.reason } satisfies Nomination
  }).pipe(Effect.withSpan("stage6b.nominateBelowTheFold"))
