/**
 * The nightly run, written as the imperative walk from docs/PIPELINE.md.
 * Stages 0-3 are live; stages 4+ land as they are built.
 */
import { SqlClient } from "@effect/sql"
import { Effect } from "effect"
import { fetchArticlesForStories, type StoryWithAccounts } from "./articles.js"
import { buildClusters, persistClusters } from "./cluster.js"
import { compositeStory } from "./composite.js"
import { archiveBrief, renderBrief, type PublishedStory } from "./render.js"
import { editorNotes, persistVerifications, verifyDraft } from "./verify.js"
import { MATCH_MODEL } from "./config.js"
import { ensureSchema } from "./db.js"
import { FunnelAnomalous, ModelMissing } from "./errors.js"
import { ingestAllFeeds } from "./feeds.js"
import { judgePairs } from "./judge.js"
import { loadMasthead } from "./masthead.js"
import { Ollama } from "./ollama.js"
import { candidatePairs, crossOutletPairCount } from "./prefilter.js"
import { nominateBelowTheFold } from "./nominate.js"
import { balanceNoteFor, markStory, persistStories, selectStories, STORY_CAP } from "./select.js"

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

  // -- Stage 6: select --------------------------------------------------------
  const selected = yield* Effect.sync(() => selectStories(masthead, clusters))
  yield* Effect.logInfo(`stage 6: ${selected.length} stories selected (cap ${STORY_CAP})`)
  for (const s of selected) {
    yield* Effect.logInfo(
      `  #${s.rank} [${s.cluster.sides.join("/")}] ${s.cluster.items[0]!.title.slice(0, 70)}` +
        (s.balanceNote ? ` — ${s.balanceNote}` : "")
    )
  }

  // -- Stage 6b: the below-the-fold nomination ---------------------------------
  // One model pick from OUTSIDE the front page; reason printed; no power
  // over the main ranking; killable in sources.toml (experiment 003).
  let stories = selected
  if (masthead.below_the_fold !== false) {
    const pool = clusters.filter(
      (c) => !selected.some((s) => s.cluster.hash === c.hash)
    )
    const nomination = yield* nominateBelowTheFold(pool, runId).pipe(Effect.either)
    if (nomination._tag === "Right" && nomination.right !== null) {
      stories = [
        ...selected,
        {
          cluster: nomination.right.cluster,
          rank: selected.length + 1,
          balanceNote: balanceNoteFor(masthead, nomination.right.cluster),
          foldReason: nomination.right.reason
        }
      ]
      yield* Effect.logInfo(
        `stage 6b: below the fold — ${nomination.right.cluster.items[0]!.title.slice(0, 60)}` +
          ` (${nomination.right.reason.slice(0, 80)})`
      )
    } else {
      yield* Effect.logInfo("stage 6b: no below-the-fold nomination today")
    }
  }
  yield* persistStories(runId, stories)

  // -- Stage 7: fetch full articles -------------------------------------------
  const withAccounts = yield* fetchArticlesForStories(stories)
  const composable: Array<StoryWithAccounts> = []
  for (const swa of withAccounts) {
    const outlets = new Set(swa.accounts.map((a) => a.item.outlet))
    if (outlets.size < 2) {
      yield* markStory(
        runId,
        swa.story.cluster.hash,
        "dropped",
        `fewer than 2 fetched accounts (${outlets.size})`
      )
      yield* Effect.logWarning(
        `  story #${swa.story.rank} dropped: fewer than 2 fetched accounts`
      )
      continue
    }
    composable.push(swa)
  }
  yield* Effect.logInfo(`stage 7: ${composable.length} stories ready to composite`)

  // -- Stages 8-9: composite, then verify — the model writes, the code checks
  const published: Array<PublishedStory> = []
  for (const swa of composable) {
    const hash = swa.story.cluster.hash
    const first = yield* compositeStory(swa).pipe(Effect.either)
    if (first._tag === "Left") {
      yield* markStory(runId, hash, "dropped", "draft malformed after two attempts")
      yield* Effect.logWarning(`  story #${swa.story.rank} dropped: draft malformed`)
      continue
    }
    let draft = first.right
    let verdict = verifyDraft(draft, swa.accounts)
    yield* persistVerifications(hash, draft.attempt, verdict)

    if (verdict.violations.length > 0) {
      yield* Effect.logWarning(
        `  story #${swa.story.rank}: ${verdict.violations.length} violation(s), one revision pass`
      )
      const revised = yield* compositeStory(swa, editorNotes(verdict)).pipe(Effect.either)
      if (revised._tag === "Right") {
        draft = revised.right
        verdict = verifyDraft(draft, swa.accounts)
        yield* persistVerifications(hash, draft.attempt, verdict)
      }
    }

    if (verdict.violations.length > 0) {
      yield* markStory(
        runId,
        hash,
        "dropped",
        `failed verification: ${verdict.violations.join("; ").slice(0, 200)}`
      )
      yield* Effect.logWarning(`  story #${swa.story.rank} dropped: failed verification`)
      continue
    }

    yield* markStory(runId, hash, "published", null)
    published.push({ story: swa.story, draft, advisories: verdict.advisories })
    yield* Effect.logInfo(
      `  story #${swa.story.rank} verified: ${draft.headline.slice(0, 70)}` +
        (verdict.advisories.length > 0 ? ` (${verdict.advisories.length} advisories)` : "")
    )
  }

  // -- Stages 10-11: render, archive, report ----------------------------------
  const droppedRows = yield* sql<{ rank: number; reason: string }>`
    SELECT rank, reason FROM stories
    WHERE run_id = ${runId} AND status = 'dropped' ORDER BY rank
  `
  const content = renderBrief(runId, published, {
    feedOutcomes: outcomes,
    funnel: {
      items: items.length,
      news: news.length,
      candidates: pairs.length,
      matches: matches.length,
      clusters: clusters.length,
      selected: stories.length,
      published: published.length
    },
    dropped: droppedRows.map((d) => ({ rank: d.rank, reason: d.reason }))
  })
  const briefPath = yield* archiveBrief(runId, content)
  yield* sql`
    UPDATE runs SET finished_at = ${new Date().toISOString()},
      notes = ${`${published.length} published, ${droppedRows.length} dropped`}
    WHERE run_id = ${runId}
  `
  yield* Effect.logInfo(
    `the ${runId} edition: ${published.length} stories -> ${briefPath}. It ends.`
  )

  return {
    runId,
    items: items.length,
    news: news.length,
    pairs: pairs.length,
    matches: matches.length,
    clusters: clusters.length
  }
}).pipe(Effect.withSpan("eto.run"))
