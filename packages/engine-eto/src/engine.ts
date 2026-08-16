/**
 * The eto engine — the editorial machinery behind the joint, stages 1-9
 * of docs/PIPELINE.md as one edition() call. The platform hands it a
 * morning (Day); it hands back an edition or its reasons. It builds its
 * own corpus through the platform's feed library, judges and clusters
 * with its own doctrine, and cages its own compositor. It never touches
 * the archive, the mail, or the schedule — those are the frame's.
 */
import { SqlClient } from "@effect/sql"
import { Effect } from "effect"
import { fetchArticlesForStories } from "@eto-press/platform/articles"
import {
  editionStoryFrom,
  type EditionStory,
  type StoryWithAccounts
} from "@eto-press/platform/edition"
import type { Day, EngineOutcome } from "@eto-press/platform/engine"
import { COMPOSITE_MODEL, MATCH_MODEL } from "@eto-press/platform/config"
import { FunnelAnomalous, MastheadInvalid, PressStalled } from "@eto-press/platform/errors"
import { ingestAllFeeds } from "@eto-press/platform/feeds"
import type { PublishedStory } from "@eto-press/platform/render"
import { classify } from "./classify.js"
import { buildClusters, persistClusters } from "./cluster.js"
import { compositeStory } from "./composite.js"
import { judgePairs } from "./judge.js"
import { nominateBelowTheFold } from "./nominate.js"
import { candidatePairs, crossOutletPairCount } from "./prefilter.js"
import {
  balanceNoteFor,
  dropAlreadyPrinted,
  dropLowDensity,
  markStory,
  persistStories,
  previouslyPrintedLinks,
  selectStories,
  STORY_CAP
} from "./select.js"
import { editorNotes, persistVerifications, verifyDraft } from "./verify.js"

const edition = (day: Day) =>
  Effect.gen(function* () {
    const { masthead, runId } = day
    const sql = yield* SqlClient.SqlClient

    // A source list is this engine's precondition, not the platform's: a
    // story is an event told through outlets that disagree, so a paper
    // with no outlets cannot be an eto paper (a desk paper can exist
    // without any — on the desk engine).
    if (masthead.source.length === 0) {
      return yield* new MastheadInvalid({
        path: "sources.toml",
        reason:
          "the eto engine needs at least one [[source]] — for a paper with no sources, use the desk engine ([engine] use = \"desk\")"
      })
    }

    // -- Stages 1-2: fetch, normalize, classify, persist ----------------------
    const { items, outcomes } = yield* ingestAllFeeds(masthead, runId, classify)
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

    // -- Stage 5c: the density floor --------------------------------------------
    // A blob the splitter could not cut must not reach print (or the fold
    // nomination pool) — the 2026-07-31 front page was one.
    const { printable, blobs } = dropLowDensity(clusters)
    for (const b of blobs) {
      yield* Effect.logWarning(
        `stage 5c: blob set aside — ${b.items.length} items, ${b.outlets.length} outlets, ` +
          `density ${b.density.toFixed(2)} (floor 0.5): ${b.items[0]!.title.slice(0, 60)}`
      )
    }

    // -- Stage 5b: cross-edition dedupe -----------------------------------------
    // The 48-hour window (feeds.ts) means consecutive editions share most of
    // their corpus; without this, yesterday's front page reprints itself.
    const printed = yield* previouslyPrintedLinks(runId)
    const { fresh, repeats } = dropAlreadyPrinted(printable, printed)
    if (repeats.length > 0) {
      yield* Effect.logInfo(
        `stage 5b: ${repeats.length} cluster(s) set aside — already printed in an earlier edition`
      )
      for (const r of repeats) {
        yield* Effect.logInfo(`  repeat: ${r.items[0]!.title.slice(0, 80)}`)
      }
    }

    // -- Stage 6: select --------------------------------------------------------
    const selected = yield* Effect.sync(() => selectStories(masthead, fresh))
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
      const pool = fresh.filter(
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
    const editionStories: Array<EditionStory> = []
    for (const swa of composable) {
      const hash = swa.story.cluster.hash
      const first = yield* compositeStory(swa).pipe(Effect.either)
      if (first._tag === "Left") {
        // A shapeless draft is an editorial failure and drops the story;
        // anything else (timeout, HTTP error, broken journal) is machinery
        // and stops the press (PressStalled — the 2026-08-02 empty edition).
        if (first.left._tag !== "DraftMalformed") {
          return yield* new PressStalled({ clusterHash: hash, cause: first.left })
        }
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
        } else if (revised.left._tag !== "DraftMalformed") {
          return yield* new PressStalled({ clusterHash: hash, cause: revised.left })
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
      // Longest account wins the outlet's link — the same tiebreak the
      // journal-side constructor uses (assemble.ts).
      const linkByOutlet = new Map<string, string>()
      for (const a of [...swa.accounts].sort((x, y) => x.text.length - y.text.length)) {
        linkByOutlet.set(a.item.outlet, a.item.link)
      }
      editionStories.push(
        editionStoryFrom({
          headline: draft.headline,
          body: draft.body,
          differ: draft.differ,
          sourcesLine: draft.sourcesLine,
          balanceNote: swa.story.balanceNote,
          foldReason: swa.story.foldReason,
          linkByOutlet
        })
      )
      yield* Effect.logInfo(
        `  story #${swa.story.rank} verified: ${draft.headline.slice(0, 70)}` +
          (verdict.advisories.length > 0 ? ` (${verdict.advisories.length} advisories)` : "")
      )
    }

    // -- The engine's report: its funnel, its drops, its health lines ----------
    const droppedRows = yield* sql<{ rank: number; reason: string }>`
      SELECT rank, reason FROM stories
      WHERE run_id = ${runId} AND status = 'dropped' ORDER BY rank
    `

    const healthLines: Array<string> = []
    const recentRuns = yield* sql<{ run_id: string }>`
      SELECT DISTINCT run_id FROM feed_fetches ORDER BY run_id DESC LIMIT 7
    `
    if (recentRuns.length > 0) {
      const oldest = recentRuns[recentRuns.length - 1]!.run_id
      const feedHealth = yield* sql<{ outlet: string; total: number; ok: number }>`
        SELECT outlet, COUNT(*) AS total, SUM(status = 'ok') AS ok
        FROM feed_fetches WHERE run_id >= ${oldest}
        GROUP BY outlet HAVING ok < total ORDER BY ok * 1.0 / total
      `
      if (feedHealth.length > 0) {
        healthLines.push(
          `Feed health (last ${recentRuns.length} runs): ` +
            feedHealth.map((f) => `${f.outlet} ${f.ok}/${f.total} ok`).join(" · ")
        )
      }
    }
    const articleHealth = yield* sql<{ outlet: string; total: number; ok: number }>`
      SELECT i.outlet AS outlet, COUNT(*) AS total, SUM(a.status = 'ok') AS ok
      FROM articles a JOIN items i ON i.id = a.item_id
      GROUP BY i.outlet HAVING total >= 5 AND ok * 1.0 / total < 0.8
      ORDER BY ok * 1.0 / total
    `
    if (articleHealth.length > 0) {
      healthLines.push(
        "Article access: " +
          articleHealth.map((a) => `${a.outlet} ${a.ok}/${a.total} readable`).join(" · ")
      )
    }

    const advisoryLines = published.flatMap((p) =>
      p.advisories.map((a) => `${p.draft.headline.slice(0, 40)}…: ${a}`)
    )

    return {
      _tag: "Edition",
      stories: editionStories,
      report: {
        feedOutcomes: outcomes,
        funnel: {
          items: items.length,
          news: news.length,
          candidates: pairs.length,
          matches: matches.length,
          clusters: clusters.length,
          repeats: repeats.length,
          selected: stories.length,
          published: published.length
        },
        blobs: blobs.map((b) => ({
          itemCount: b.items.length,
          outletCount: b.outlets.length,
          density: b.density
        })),
        dropped: droppedRows.map((d) => ({ rank: d.rank, reason: d.reason })),
        healthLines
      },
      advisoryLines
    } satisfies EngineOutcome
  }).pipe(Effect.withSpan("eto.edition"))

/** The eto engine: NORTH-STAR §§1-6 as machinery, behind one joint. */
export const etoEngine = {
  name: "eto",
  doctrine: [
    "One story, many mouths.",
    "The disagreement is the story.",
    "Nothing unattributed ships.",
    "The model composites. It does not comment.",
    "Incomplete beats wrong.",
    "The masthead is yours."
  ],
  models: [MATCH_MODEL, COMPOSITE_MODEL],
  edition
} as const
