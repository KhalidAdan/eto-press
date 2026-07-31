/**
 * Stage 5: cluster yes-verdicts into events, with a density gate.
 *
 * Experiment 002 failure mode 1: union-find alone welds storylines into
 * blobs via transitive chaining (A-B yes, B-C yes, but A-C would be no).
 * The gate: a component whose internal yes-density is low gets its
 * zero-support yes-edges cut — an edge with no common yes-neighbor is a
 * bridge between happenings, not part of one. Dense cores survive; glue
 * doesn't.
 *
 * Pure functions; persistence lives at the bottom, behind the same file's
 * doorstep, so the algorithm is testable with plain fixtures.
 */
import { SqlClient } from "@effect/sql"
import { Effect } from "effect"
import { createHash } from "node:crypto"
import type { JudgedPair } from "./judge.js"
import type { Item } from "./normalize.js"

/** Below this internal yes-density, a component of >= 3 is treated as a
 * chained blob and its unsupported edges are cut. Chosen against the
 * experiment 002 corpus; revisit with data, not vibes. */
export const DENSITY_MIN = 0.5

/** How much triangle support the shear will demand before giving up. Low
 * values sufficed on the 2026-07-31 corpus (replayed offline); a component
 * that survives the ceiling intact stays a blob for stage 5c to refuse. */
export const SUPPORT_CEILING = 6

export interface Cluster {
  readonly hash: string
  readonly items: ReadonlyArray<Item>
  readonly outlets: ReadonlyArray<string>
  readonly sides: ReadonlyArray<string>
  readonly density: number
  readonly wasSplit: boolean
}

class UnionFind {
  private readonly parent = new Map<number, number>()

  find(x: number): number {
    let root = this.parent.get(x) ?? x
    if (root !== x) {
      root = this.find(root)
      this.parent.set(x, root)
    }
    return root
  }

  union(a: number, b: number): void {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent.set(ra, rb)
  }
}

const edgeKey = (a: number, b: number): string =>
  a < b ? `${a}-${b}` : `${b}-${a}`

const clusterHash = (items: ReadonlyArray<Item>): string =>
  createHash("sha256")
    .update([...items.map((i) => i.link)].sort().join("\n"))
    .digest("hex")
    .slice(0, 16)

const componentsOf = (
  ids: ReadonlyArray<number>,
  edges: ReadonlyArray<readonly [number, number]>
): Array<Array<number>> => {
  const uf = new UnionFind()
  for (const [a, b] of edges) uf.union(a, b)
  const byRoot = new Map<number, Array<number>>()
  for (const id of ids) {
    const root = uf.find(id)
    const group = byRoot.get(root)
    if (group) group.push(id)
    else byRoot.set(root, [id])
  }
  return [...byRoot.values()]
}

export const buildClusters = (
  judged: ReadonlyArray<JudgedPair>
): ReadonlyArray<Cluster> => {
  const itemsById = new Map<number, Item>()
  for (const j of judged) {
    itemsById.set(j.pair.a.id, j.pair.a)
    itemsById.set(j.pair.b.id, j.pair.b)
  }

  const yesEdges: Array<readonly [number, number]> = []
  const judgedByKey = new Map<string, boolean>()
  for (const j of judged) {
    const key = edgeKey(j.pair.a.id, j.pair.b.id)
    judgedByKey.set(key, j.same)
    if (j.same) yesEdges.push([j.pair.a.id, j.pair.b.id])
  }

  const withStats = (
    memberIds: ReadonlyArray<number>,
    wasSplit: boolean
  ): Cluster => {
    const items = memberIds.map((id) => itemsById.get(id)!)
    const memberSet = new Set(memberIds)
    let yes = 0
    let total = 0
    for (const [key, same] of judgedByKey) {
      const [a, b] = key.split("-").map(Number)
      if (memberSet.has(a!) && memberSet.has(b!)) {
        total++
        if (same) yes++
      }
    }
    return {
      hash: clusterHash(items),
      items,
      outlets: [...new Set(items.map((i) => i.outlet))].sort(),
      sides: [...new Set(items.map((i) => i.side))].sort(),
      density: total === 0 ? 1 : yes / total,
      wasSplit
    }
  }

  const clusters: Array<Cluster> = []
  const allIds = [...itemsById.keys()]

  // Yes-edges of one component, kept only if the pair has >= minSupport
  // common yes-neighbors inside it. Accounts of one event vouch for each
  // other many times over; a bridge between events has few mutual friends.
  const supportedEdges = (
    memberSet: ReadonlySet<number>,
    minSupport: number
  ): Array<readonly [number, number]> => {
    const internalYes = yesEdges.filter(
      ([a, b]) => memberSet.has(a) && memberSet.has(b)
    )
    const neighbors = new Map<number, Set<number>>()
    for (const [a, b] of internalYes) {
      if (!neighbors.has(a)) neighbors.set(a, new Set())
      if (!neighbors.has(b)) neighbors.set(b, new Set())
      neighbors.get(a)!.add(b)
      neighbors.get(b)!.add(a)
    }
    return internalYes.filter(([a, b]) => {
      const na = neighbors.get(a)!
      const nb = neighbors.get(b)!
      let common = 0
      for (const n of na) if (n !== b && nb.has(n) && ++common >= minSupport) return true
      return false
    })
  }

  // Emit a component if it passes the gate; otherwise shear it — demand
  // ever more triangle support until it breaks, then recurse into the
  // pieces. One pass at support 1 (the old behavior) is not enough when
  // storylines share genuine cross-coverage: every bridge sits in some
  // triangle, so the bar must rise until bridges shear before cores do.
  const emitOrShear = (memberIds: ReadonlyArray<number>, wasSplit: boolean): void => {
    if (memberIds.length < 2) return
    const candidate = withStats(memberIds, wasSplit)

    if (memberIds.length < 3 || candidate.density >= DENSITY_MIN) {
      clusters.push(candidate)
      return
    }

    const memberSet = new Set(memberIds)
    for (let support = 1; support <= SUPPORT_CEILING; support++) {
      const subs = componentsOf(memberIds, supportedEdges(memberSet, support))
        .filter((s) => s.length >= 2)
      const madeProgress =
        subs.length > 1 ||
        (subs.length === 1 && subs[0]!.length < memberIds.length)
      if (madeProgress) {
        for (const sub of subs) emitOrShear(sub, true)
        return
      }
    }

    // Ceiling reached, still one piece: a blob even maximal support cannot
    // cut. Emit it as measured; stage 5c refuses it visibly.
    clusters.push(candidate)
  }

  for (const memberIds of componentsOf(allIds, yesEdges)) {
    emitOrShear(memberIds, false)
  }

  return [...clusters]
    .filter((c) => c.outlets.length >= 2)
    .sort(
      (a, b) =>
        b.outlets.length - a.outlets.length || b.items.length - a.items.length
    )
}

/** Reruns replace the day's clusters wholesale — until editor corrections
 * exist, recomputation is the truth (see table comment in db.ts). */
export const persistClusters = (
  runId: string,
  clusters: ReadonlyArray<Cluster>
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`DELETE FROM cluster_items WHERE run_id = ${runId}`
    yield* sql`DELETE FROM clusters WHERE run_id = ${runId}`
    for (const c of clusters) {
      yield* sql`INSERT INTO clusters ${sql.insert({
        run_id: runId,
        cluster_hash: c.hash,
        density: c.density,
        was_split: c.wasSplit ? 1 : 0,
        item_count: c.items.length,
        outlet_count: c.outlets.length,
        sides: c.sides.join("/"),
        created_at: new Date().toISOString()
      })}`
      for (const item of c.items) {
        yield* sql`INSERT INTO cluster_items ${sql.insert({
          run_id: runId,
          cluster_hash: c.hash,
          item_id: item.id
        })}`
      }
    }
  }).pipe(Effect.withSpan("stage5.persistClusters"))
