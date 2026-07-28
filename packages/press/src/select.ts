/**
 * Stage 6: select stories. All deterministic masthead rules:
 * >= 2 outlets (enforced upstream), ranked by breadth, capped — the brief
 * ends (NORTH-STAR §7). One-sided stories run WITH the measurement printed
 * (§6): eto reports collapse, it does not censor it.
 */
import { SqlClient } from "@effect/sql"
import { Effect } from "effect"
import type { Cluster } from "./cluster.js"
import type { Masthead } from "./masthead.js"

/** The brief is finite by construction. */
export const STORY_CAP = 8

export interface Story {
  readonly cluster: Cluster
  readonly rank: number
  readonly balanceNote: string | null
  /** Set only on the below-the-fold nomination (stage 6b) — the model's
   * printed, editor-graded reason. Main stories never carry one. */
  readonly foldReason: string | null
}

/** Stage 5b: what earlier editions actually printed. Only status
 * 'published' counts — a story selected but dropped never reached the
 * reader, so its articles stay eligible. Same-day rows are excluded so a
 * retry can reprint its own morning's selections. */
export const previouslyPrintedLinks = (runId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<{ link: string }>`
      SELECT DISTINCT i.link AS link
      FROM stories s
      JOIN cluster_items ci
        ON ci.run_id = s.run_id AND ci.cluster_hash = s.cluster_hash
      JOIN items i ON i.id = ci.item_id
      WHERE s.status = 'published' AND s.run_id < ${runId}
    `
    return new Set(rows.map((r) => r.link))
  }).pipe(Effect.withSpan("stage5b.previouslyPrintedLinks"))

/** Stage 5b: cross-edition dedupe. A cluster is a repeat when MORE THAN
 * HALF its members were already printed: the 48-hour window's carryover of
 * yesterday's front page dies here, while a story that returns with mostly
 * new reporting is a development and runs again. Deterministic on purpose —
 * the threshold is arithmetic, not a model's mood. */
export const dropAlreadyPrinted = (
  clusters: ReadonlyArray<Cluster>,
  printed: ReadonlySet<string>
): { fresh: Array<Cluster>; repeats: Array<Cluster> } => {
  const fresh: Array<Cluster> = []
  const repeats: Array<Cluster> = []
  for (const c of clusters) {
    const overlap = c.items.filter((it) => printed.has(it.link)).length
    if (overlap * 2 > c.items.length) repeats.push(c)
    else fresh.push(c)
  }
  return { fresh, repeats }
}

export const balanceNoteFor = (
  masthead: Masthead,
  cluster: Cluster
): string | null => {
  const allSides = [...new Set(masthead.source.map((s) => s.side))].sort()
  const missing = allSides.filter((s) => !cluster.sides.includes(s))
  return missing.length === 0
    ? null
    : `No source labeled ${missing.join(" or ")} covered this story.`
}

export const selectStories = (
  masthead: Masthead,
  clusters: ReadonlyArray<Cluster>
): ReadonlyArray<Story> => {
  const ranked = [...clusters].sort(
    (a, b) =>
      b.outlets.length - a.outlets.length ||
      b.sides.length - a.sides.length ||
      b.items.length - a.items.length
  )

  return ranked.slice(0, STORY_CAP).map((cluster, i) => ({
    cluster,
    rank: i + 1,
    balanceNote: balanceNoteFor(masthead, cluster),
    foldReason: null
  }))
}

export const persistStories = (
  runId: string,
  stories: ReadonlyArray<Story>
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`DELETE FROM stories WHERE run_id = ${runId}`
    for (const s of stories) {
      yield* sql`INSERT INTO stories ${sql.insert({
        run_id: runId,
        cluster_hash: s.cluster.hash,
        rank: s.rank,
        balance_note: s.balanceNote,
        status: "selected",
        reason: null,
        fold_reason: s.foldReason
      })}`
    }
  }).pipe(Effect.withSpan("stage6.persistStories"))

/** Stages 8-10 record each story's fate here; the report reads it back. */
export const markStory = (
  runId: string,
  clusterHash: string,
  status: "published" | "dropped",
  reason: string | null
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      UPDATE stories SET status = ${status}, reason = ${reason}
      WHERE run_id = ${runId} AND cluster_hash = ${clusterHash}
    `
  })
