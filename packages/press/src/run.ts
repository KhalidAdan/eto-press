/**
 * The frame of the morning. The platform owns everything here: preflight
 * (configuration, migrations, model pins), the run's identity, and the
 * tail — corrections, the four dialects, the append-only archive, the
 * report frame. The engine owns the whole middle, reached exactly once,
 * at edition(day). Which engine is a paper-level declaration: [engine]
 * use = "..." in eto.toml, defaulting to eto.
 */
import { FileSystem } from "@effect/platform"
import { SqlClient } from "@effect/sql"
import { Effect } from "effect"
import type { Day, Engine, EngineOutcome } from "@eto-press/platform/engine"
import { archiveBrief, renderBrief, type CorrectionNotice } from "@eto-press/platform/render"
import { ensureSchema } from "@eto-press/platform/db"
import { ModelDrifted, ModelMissing } from "@eto-press/platform/errors"
import { loadMasthead } from "@eto-press/platform/masthead"
import { Ollama } from "@eto-press/platform/ollama"
import { etoEngine } from "@eto-press/engine-eto/engine"

/** The run id is the editor's local calendar date — the morning the brief is
 * for. (Found the hard way: the first live run stamped itself with the UTC
 * date at 9:51 p.m. local.) */
const localDateId = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`

export const pressRun = <R>(engine: Engine<any, R>) =>
  Effect.gen(function* () {
    // -- Stage 0: preflight — configuration problems stop the press loudly ----
    const masthead = yield* loadMasthead("sources.toml")
    yield* ensureSchema
    const sql = yield* SqlClient.SqlClient

    // Model presence and digest pinning (§10): an `ollama pull` must never
    // silently change the paper's mind. The engine declares which models it
    // calls; an engine that declares none needs no Ollama at all.
    if (engine.models.length > 0) {
      const ollama = yield* Ollama
      const installed = yield* ollama.installedModels
      const names = installed.map((m) => m.name)
      for (const model of engine.models) {
        if (!names.includes(model)) {
          return yield* new ModelMissing({ model, installed: names })
        }
      }

      const fs = yield* FileSystem.FileSystem
      const LOCK = "models.lock.json"
      const current = Object.fromEntries(
        installed
          .filter((m) => engine.models.includes(m.name))
          .map((m) => [m.name, m.digest])
      )
      if (yield* fs.exists(LOCK).pipe(Effect.orDie)) {
        const locked = JSON.parse(
          yield* fs.readFileString(LOCK).pipe(Effect.orDie)
        ) as Record<string, string>
        for (const [model, digest] of Object.entries(locked)) {
          if (current[model] !== undefined && current[model] !== digest) {
            return yield* new ModelDrifted({
              model,
              expected: digest,
              actual: current[model]
            })
          }
        }
      } else {
        yield* fs.writeFileString(LOCK, JSON.stringify(current, null, 2) + "\n").pipe(Effect.orDie)
        yield* Effect.logInfo(`model digests pinned to ${LOCK}`)
      }
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
      `run ${runId} on the ${engine.name} engine: masthead has ${masthead.source.length} sources`
    )

    // -- The joint: the engine's whole morning, one call ----------------------
    const day: Day = { runId, masthead }
    const outcome: EngineOutcome = yield* engine.edition(day)

    // -- NoEdition: true silence — no file, no mail, an honest note -----------
    if (outcome._tag === "NoEdition") {
      yield* sql`
        UPDATE runs SET finished_at = ${new Date().toISOString()},
          notes = ${`no edition: ${outcome.reason}`}
        WHERE run_id = ${runId}
      `
      yield* Effect.logInfo(`no ${runId} edition — ${outcome.reason}. The press rests.`)
      return { runId, published: 0, noEdition: true }
    }

    // -- The tail: corrections, render, archive, report -----------------------
    // Pending corrections print at the top of THIS edition (§9), dated,
    // pointing back. The archive they point at is never touched.
    const pendingCorrections = yield* sql<{
      id: number
      edition: string
      story_rank: number
      note: string
    }>`SELECT id, edition, story_rank, note FROM corrections WHERE printed_in IS NULL ORDER BY id`
    const corrections: Array<CorrectionNotice> = []
    for (const c of pendingCorrections) {
      const h = yield* sql<{ headline: string | null }>`
        SELECT d.headline AS headline FROM stories s
        LEFT JOIN drafts d ON d.cluster_hash = s.cluster_hash
        WHERE s.run_id = ${c.edition} AND s.rank = ${c.story_rank} AND s.status = 'published'
        GROUP BY s.cluster_hash LIMIT 1
      `
      corrections.push({
        edition: c.edition,
        storyRank: c.story_rank,
        headline: h[0]?.headline ?? `story #${c.story_rank}`,
        note: c.note
      })
    }

    const content = renderBrief(
      { runId, stories: outcome.stories, corrections },
      outcome.report,
      outcome.advisoryLines
    )
    const briefPath = yield* archiveBrief(runId, content)
    for (const c of pendingCorrections) {
      yield* sql`UPDATE corrections SET printed_in = ${runId} WHERE id = ${c.id}`
    }
    yield* sql`
      UPDATE runs SET finished_at = ${new Date().toISOString()},
        notes = ${`${outcome.stories.length} published (${engine.name} engine)`}
      WHERE run_id = ${runId}
    `
    yield* Effect.logInfo(
      `the ${runId} edition: ${outcome.stories.length} stories -> ${briefPath}. It ends.`
    )

    return { runId, published: outcome.stories.length, noEdition: false }
  }).pipe(Effect.withSpan("eto.run"))

/** The flagship binding, kept for the generation-1 public API. */
export const nightly = pressRun(etoEngine)
