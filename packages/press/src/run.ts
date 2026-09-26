/**
 * The frame of the morning. The platform owns everything here: preflight
 * (configuration, migrations, model pins), the run's identity, and the
 * tail — corrections, the dialects, the append-only archive, the report
 * frame. An engine owns the whole middle of ONE SECTION, reached exactly
 * once per section, at edition(day).
 *
 * Generation 3: a paper is sections (eto.toml `[[section]]`, in print
 * order), each printed by one engine from its own source file, bound
 * into one morning. A paper that declares no sections is a paper with
 * one — printed by `[engine] use` from sources.toml — and renders exactly
 * as generation 2 rendered it.
 */
import { FileSystem } from "@effect/platform"
import { SqlClient } from "@effect/sql"
import { Effect } from "effect"
import { SECTIONED, SECTIONS, type SectionDecl } from "@eto-press/platform/config"
import { Desk, deskDir } from "@eto-press/platform/desk"
import type { AbsentSection, PaperEdition, PaperSection } from "@eto-press/platform/edition"
import type { Day, Engine, EngineOutcome } from "@eto-press/platform/engine"
import { persistPublishedStories } from "@eto-press/platform/published"
import { archiveBrief, renderPaper, type CorrectionNotice } from "@eto-press/platform/render"
import { ensureSchema } from "@eto-press/platform/db"
import { MastheadInvalid, ModelDrifted } from "@eto-press/platform/errors"
import { Inference } from "@eto-press/platform/inference"
import { loadMasthead, type Masthead } from "@eto-press/platform/masthead"
import { etoEngine } from "@eto-press/engine-eto/engine"

/** The run id is the editor's local calendar date — the morning the brief is
 * for. (Found the hard way: the first live run stamped itself with the UTC
 * date at 9:51 p.m. local.) */
const localDateId = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`

/** A section resolved against the registry, with its masthead loaded. */
interface Desk_<R> {
  readonly decl: SectionDecl
  readonly engine: Engine<any, R>
  readonly masthead: Masthead
}

/** Generation 3's one new rule at the masthead: a feed URL lives in one
 * section only. The journal keys an item by its link and gives it one
 * side, so one feed cannot serve two desks. Pure, exported for tests. */
export const duplicateFeeds = (
  sections: ReadonlyArray<{ readonly decl: Pick<SectionDecl, "slug">; readonly masthead: Masthead }>
): Array<{ url: string; sections: Array<string> }> => {
  const seen = new Map<string, Array<string>>()
  for (const { decl, masthead } of sections) {
    for (const source of masthead.source) {
      for (const url of source.feeds) {
        const list = seen.get(url) ?? []
        if (!list.includes(decl.slug)) list.push(decl.slug)
        seen.set(url, list)
      }
    }
  }
  return [...seen.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([url, list]) => ({ url, sections: list }))
}

/** Bind the sections' outcomes into the morning: what printed, what was
 * absent and why. Pure, exported for tests. */
export const bindOutcomes = (
  outcomes: ReadonlyArray<{ readonly decl: Pick<SectionDecl, "slug" | "name">; readonly outcome: EngineOutcome }>
): { sections: Array<PaperSection>; absent: Array<AbsentSection> } => {
  const sections: Array<PaperSection> = []
  const absent: Array<AbsentSection> = []
  for (const { decl, outcome } of outcomes) {
    if (outcome._tag === "NoEdition") {
      absent.push({ slug: decl.slug, name: decl.name, reason: outcome.reason })
    } else {
      sections.push({
        slug: decl.slug,
        name: decl.name,
        stories: outcome.stories,
        report: outcome.report,
        advisoryLines: outcome.advisoryLines
      })
    }
  }
  return { sections, absent }
}

export const pressRun = <R>(registry: Record<string, Engine<any, R>>) =>
  Effect.gen(function* () {
    // -- Stage 0: preflight — configuration problems stop the press loudly ----
    const desks: Array<Desk_<R>> = []
    for (const decl of SECTIONS) {
      const engine = registry[decl.engine]
      if (engine === undefined) {
        return yield* new MastheadInvalid({
          path: "eto.toml",
          reason:
            `section "${decl.slug}" names engine "${decl.engine}", but this press only knows: ` +
            Object.keys(registry).join(", ")
        })
      }
      const masthead = yield* loadMasthead(decl.masthead)
      desks.push({ decl, engine, masthead })
    }
    const duplicates = duplicateFeeds(desks)
    if (duplicates.length > 0) {
      const first = duplicates[0]!
      return yield* new MastheadInvalid({
        path: "eto.toml",
        reason:
          `a feed may belong to one section only, and ${first.url} is listed under ` +
          `${first.sections.join(" and ")}` +
          (duplicates.length > 1 ? ` (${duplicates.length - 1} more like it)` : "") +
          ` — the journal keys an item by its link and gives it one side`
      })
    }

    yield* ensureSchema
    const sql = yield* SqlClient.SqlClient

    // Model presence and digest pinning (§10): an `ollama pull` must never
    // silently change the paper's mind. Each engine declares whether it
    // asks models anything; the union across the paper's sections is what
    // preflight pins, once. A paper whose desks all say "no models" never
    // wakes Ollama. A null digest is an honest "unpinnable" — logged,
    // never locked.
    const models = [...new Set(desks.flatMap((d) => d.engine.models))]
    if (models.length > 0) {
      const inference = yield* Inference
      const pinned = yield* inference.pin()

      const fs = yield* FileSystem.FileSystem
      const LOCK = "models.lock.json"
      const current: Record<string, string> = {}
      for (const p of pinned) {
        if (p.digest === null) {
          yield* Effect.logInfo(
            `model ${p.model}: the ${inference.provider} provider exposes no digest — unpinnable`
          )
        } else {
          current[p.model] = p.digest
        }
      }
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
      `run ${runId}: ${desks.length} section(s) — ` +
        desks
          .map((d) => `${d.decl.slug} on ${d.engine.name} (${d.masthead.source.length} sources)`)
          .join(", ")
    )

    // -- The joint: each section's whole morning, one call each, in order --
    const outcomes: Array<{ decl: SectionDecl; outcome: EngineOutcome }> = []
    for (const { decl, engine, masthead } of desks) {
      const day: Day = { runId, section: { slug: decl.slug, name: decl.name }, masthead }
      // The desk is the section's: desk/<slug>/ on a sectioned paper,
      // desk/ on the compatibility paper. Engines see the same capability.
      const desk = yield* Desk.at(deskDir(SECTIONED, decl.slug))
      const outcome: EngineOutcome = yield* engine
        .edition(day)
        .pipe(Effect.provideService(Desk, desk), Effect.withSpan(`section.${decl.slug}`))
      if (outcome._tag === "NoEdition") {
        yield* Effect.logWarning(`section ${decl.slug}: no edition — ${outcome.reason}`)
      } else {
        yield* Effect.logInfo(`section ${decl.slug}: ${outcome.stories.length} stories`)
      }
      outcomes.push({ decl, outcome })
    }
    const { sections, absent } = bindOutcomes(outcomes)

    // -- NoEdition: true silence — no file, no mail, an honest note -----------
    // Every section silent is the paper's silence. One section silent
    // while another prints is a warning on the page (NORTH-STAR §5).
    if (sections.length === 0) {
      const reason = absent.map((a) => `${a.slug}: ${a.reason}`).join("; ")
      yield* sql`
        UPDATE runs SET finished_at = ${new Date().toISOString()},
          notes = ${`no edition: ${reason}`}
        WHERE run_id = ${runId}
      `
      yield* Effect.logInfo(`no ${runId} edition — ${reason}. The press rests.`)
      return { runId, published: 0, noEdition: true, absent }
    }
    for (const a of absent) {
      yield* Effect.logWarning(
        `WARNING: section ${a.slug} (${a.name}) did not print this morning — ${a.reason}. ` +
          `Look into it: the paper prints without it.`
      )
    }

    // -- The tail: corrections, render, archive, report -----------------------
    // Pending corrections print at the top of THIS edition (§9), dated,
    // pointing back. The archive they point at is never touched.
    const pendingCorrections = yield* sql<{
      id: number
      edition: string
      story_rank: number
      section: string | null
      note: string
    }>`SELECT id, edition, story_rank, section, note FROM corrections WHERE printed_in IS NULL ORDER BY id`
    const corrections: Array<CorrectionNotice> = []
    for (const c of pendingCorrections) {
      // The published-edition store is the engine-agnostic lookup; the
      // legacy engine-table join covers editions published before it.
      const stored = yield* sql<{ headline: string; section: string }>`
        SELECT headline, section FROM published_stories
        WHERE run_id = ${c.edition} AND position = ${c.story_rank} LIMIT 1
      `
      const legacy =
        stored.length > 0
          ? []
          : yield* sql<{ headline: string | null }>`
              SELECT d.headline AS headline FROM stories s
              LEFT JOIN drafts d ON d.cluster_hash = s.cluster_hash
              WHERE s.run_id = ${c.edition} AND s.rank = ${c.story_rank} AND s.status = 'published'
              GROUP BY s.cluster_hash LIMIT 1
            `
      corrections.push({
        edition: c.edition,
        storyRank: c.story_rank,
        section: c.section ?? stored[0]?.section ?? null,
        headline: stored[0]?.headline ?? legacy[0]?.headline ?? `story #${c.story_rank}`,
        note: c.note
      })
    }

    const paper: PaperEdition = { runId, sections, absent, corrections }
    const content = renderPaper(paper)
    const briefPath = yield* archiveBrief(runId, content)
    // The store is the archive's queryable shadow: written only after the
    // archive write succeeded, idempotently, so the two can never disagree.
    yield* persistPublishedStories(runId, sections)
    for (const c of pendingCorrections) {
      yield* sql`UPDATE corrections SET printed_in = ${runId} WHERE id = ${c.id}`
    }
    const published = sections.reduce((n, s) => n + s.stories.length, 0)
    const notes =
      desks.length === 1
        ? `${published} published (${desks[0]!.engine.name} engine)`
        : `${published} published across ${sections.length} of ${desks.length} sections` +
          (absent.length > 0 ? ` (absent: ${absent.map((a) => a.slug).join(", ")})` : "")
    yield* sql`
      UPDATE runs SET finished_at = ${new Date().toISOString()}, notes = ${notes}
      WHERE run_id = ${runId}
    `
    yield* Effect.logInfo(`the ${runId} edition: ${published} stories -> ${briefPath}. It ends.`)

    return { runId, published, noEdition: false, absent }
  }).pipe(Effect.withSpan("eto.run"))

/** The flagship binding, kept for the generation-1 public API: a paper on
 * the eto engine, declaring no sections. */
export const nightly = pressRun({ eto: etoEngine })
