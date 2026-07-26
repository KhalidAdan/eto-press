/**
 * The nightly run, written as the imperative walk from docs/PIPELINE.md.
 * Stages 0-3 are live; stages 4+ land as they are built.
 */
import { SqlClient } from "@effect/sql"
import { Effect } from "effect"
import { buildClusters, persistClusters } from "./cluster.js"
import { MATCH_MODEL } from "./config.js"
import { ensureSchema } from "./db.js"
import { FunnelAnomalous, ModelMissing } from "./errors.js"
import { ingestAllFeeds } from "./feeds.js"
import { judgePairs } from "./judge.js"
import { loadMasthead } from "./masthead.js"
import { Ollama } from "./ollama.js"
import { candidatePairs, crossOutletPairCount } from "./prefilter.js"

/** The run id is the editor's local calendar date — the morning the brief is
 * for. (Found the hard way: the first live run stamped itself with the UTC
 * date at 9:51 p.m. local.) */
const localDateId = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`

export const nightly = Effect.gen(function* () {
  // -- Stage 0: preflight ---------------------------------------------------
  const masthead = yield* loadMasthead("sources.toml")
  yield* ensureSchema
  const sql = yield* SqlClient.SqlClient
  const ollama = yield* Ollama

  const installed = yield* ollama.installedModels
  if (!installed.includes(MATCH_MODEL)) {
    return yield* new ModelMissing({ model: MATCH_MODEL, installed })
  }

  const runId = localDateId(new Date())
  yield* sql`
    INSERT INTO runs ${sql.insert({
      run_id: runId,
      started_at: new Date().toISOString()
    })}
    ON CONFLICT (run_id) DO NOTHING
  `
  yield* Effect.logInfo(
    `run ${runId}: masthead has ${masthead.source.length} sources`
  )

  // -- Stages 1-2: fetch, normalize, classify, persist ----------------------
  const { items, outcomes } = yield* ingestAllFeeds(masthead, runId)
  const failed = outcomes.filter((o) => o.status !== "ok")
  yield* Effect.logInfo(
    `ingested ${items.length} in-window items from ` +
      `${outcomes.length - failed.length}/${outcomes.length} feeds`
  )
  for (const f of failed) {
    yield* Effect.logWarning(`  degraded: ${f.outlet} ${f.url} (${f.status})`)
  }

  // -- Stage 3: window + prefilter ------------------------------------------
  const news = items.filter((it) => it.kind === "news")
  const pairs = candidatePairs(news)
  const total = crossOutletPairCount(news)
  yield* Effect.logInfo(
    `funnel: ${items.length} items -> ${news.length} news -> ` +
      `${total} cross-outlet pairs -> ${pairs.length} candidates`
  )

  // Tripwire: cheap sanity beats expensive garbage.
  if (news.length > 20 && pairs.length === 0) {
    return yield* new FunnelAnomalous({
      items: news.length,
      candidatePairs: 0,
      reason: "many news items but zero candidate pairs — prefilter broken?"
    })
  }
  if (pairs.length > news.length * 20) {
    return yield* new FunnelAnomalous({
      items: news.length,
      candidatePairs: pairs.length,
      reason: "candidate pairs vastly exceed profile — prefilter broken?"
    })
  }

  // -- Stage 4: judge -------------------------------------------------------
  const judged = yield* judgePairs(pairs)
  const matches = judged.filter((j) => j.same)
  yield* Effect.logInfo(`stage 4: ${matches.length} same-event matches`)

  // -- Stage 5: cluster with the density gate --------------------------------
  const clusters = buildClusters(judged)
  yield* persistClusters(runId, clusters)
  const split = clusters.filter((c) => c.wasSplit).length
  yield* Effect.logInfo(
    `stage 5: ${clusters.length} multi-outlet clusters` +
      (split > 0 ? ` (${split} recovered from low-density blobs)` : "")
  )
  for (const c of clusters) {
    yield* Effect.logInfo(
      `  [${c.sides.join("/")}] density ${c.density.toFixed(2)}${c.wasSplit ? " (split)" : ""}`
    )
    for (const it of c.items) {
      yield* Effect.logInfo(`    ${it.outlet}: ${it.title.slice(0, 80)}`)
    }
  }

  // -- Stage 6+: select, fetch, composite, verify, render --------------------
  // Not yet built. The walk ends here, on purpose, until they are.
  yield* Effect.logInfo("stages 6+ not yet implemented — run ends")

  return {
    runId,
    items: items.length,
    news: news.length,
    pairs: pairs.length,
    matches: matches.length,
    clusters: clusters.length
  }
}).pipe(Effect.withSpan("eto.run"))
