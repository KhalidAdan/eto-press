/**
 * Stage 10: render and archive. The archive is files; the database is the
 * newsroom. The write refuses to overwrite (NORTH-STAR §9) — the single
 * non-idempotent step in the pipeline, which is why it is last, atomic
 * (temp file + rename), and guarded by existence.
 *
 * Escape hatch for development only: ETO_REPUBLISH=1 allows overwriting
 * today's brief, loudly.
 *
 * Stage 11: the run report is part of the edition — the editor's
 * measurement surface, printed as data, not advice.
 */
import { FileSystem } from "@effect/platform"
import { Effect } from "effect"
import type {
  Draft,
  EditionCorrection,
  EditionDocument,
  EditionStory,
  Story
} from "./edition.js"
import { PAPER_MOTTO, PAPER_NAME } from "./config.js"
import { BriefAlreadyPublished } from "./errors.js"
import type { FeedOutcome } from "./feeds.js"

export interface PublishedStory {
  readonly story: Story
  readonly draft: Draft
  readonly advisories: ReadonlyArray<string>
}

export type CorrectionNotice = EditionCorrection

export interface RunReport {
  readonly feedOutcomes: ReadonlyArray<FeedOutcome>
  /** The eto engine's funnel. Absent for engines with no funnel to report. */
  readonly funnel?: {
    readonly items: number
    readonly news: number
    readonly candidates: number
    readonly matches: number
    readonly clusters: number
    /** Clusters set aside by stage 5b: already printed in an earlier edition. */
    readonly repeats: number
    readonly selected: number
    readonly published: number
  }
  readonly dropped: ReadonlyArray<{ readonly rank: number; readonly reason: string }>
  /** Clusters set aside by stage 5c: still below the density floor after the
   * splitter — welded blobs, not stories. */
  readonly blobs?: ReadonlyArray<{
    readonly itemCount: number
    readonly outletCount: number
    readonly density: number
  }>
  /** Source-health trends — the §6/§8 instrument panel. */
  readonly healthLines?: ReadonlyArray<string>
}

const longDate = (runId: string): string =>
  new Date(`${runId}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  })

export const renderBrief = (
  doc: EditionDocument,
  report: RunReport,
  advisoryLines: ReadonlyArray<string> = []
): string => {
  const parts: Array<string> = [
    `# ${PAPER_NAME} — ${longDate(doc.runId)}`,
    "",
    `*${PAPER_MOTTO}*`,
    ""
  ]

  // Corrections lead the edition (NORTH-STAR §9): dated, pointing back,
  // never reaching into the archive.
  if (doc.corrections.length > 0) {
    parts.push("---", "", "## Corrections", "")
    for (const c of doc.corrections) {
      parts.push(
        `In the edition of ${longDate(c.edition)}, the story "${c.headline}": ${c.note} ` +
          `The original stands unchanged in [the archive](${c.edition}.md).`
      )
      parts.push("")
    }
  }

  const mains = doc.stories.filter((s) => s.foldReason === null)
  const fold = doc.stories.find((s) => s.foldReason !== null)

  // The archive prints the compositor's text verbatim — the raw fields,
  // never the split form. The record is what was written, not a re-layout.
  // Differ and sources are anatomy some engines guarantee (eto's cage
  // does) and others never produce (a desk entry has no accounts).
  const pushStory = (s: EditionStory) => {
    parts.push(`## ${s.headline}`, "")
    if (s.byline !== undefined && s.byline !== null) {
      parts.push(`*By ${s.byline}*`, "")
    }
    if (s.body.trim() !== "") parts.push(s.body, "")
    for (const link of s.links ?? []) {
      parts.push(`- [${link.title}](${link.href})${link.note !== null ? ` — ${link.note}` : ""}`)
    }
    if ((s.links ?? []).length > 0) parts.push("")
    if (s.differ.trim() !== "") {
      parts.push("**Where the accounts differ**", "", s.differ, "")
    }
    if (s.sourcesLine.trim() !== "") {
      parts.push(`**Sources**  ${s.sourcesLine}`)
      if (s.balanceNote !== null) parts.push("", `*${s.balanceNote}*`)
    } else if (s.balanceNote !== null) {
      parts.push(`*${s.balanceNote}*`)
    }
    parts.push("")
  }

  for (const s of mains) {
    parts.push("---", "")
    pushStory(s)
  }

  if (fold !== undefined) {
    parts.push("---", "", "## Below the fold", "")
    parts.push(
      "*One nomination from outside the front page. The model's printed reason — judge it:*"
    )
    parts.push(`*${fold.foldReason}*`, "")
    pushStory(fold)
  }

  if (doc.stories.length === 0) {
    parts.push("---", "", "Nothing to print today: no event was covered by")
    parts.push("two or more of your sources within the window. That is a")
    parts.push("measurement, not a malfunction.", "")
  }

  const ok = report.feedOutcomes.filter((o) => o.status === "ok").length
  const failedFeeds = report.feedOutcomes.filter((o) => o.status !== "ok")
  parts.push("---", "", "## The run, reported", "")
  if (report.feedOutcomes.length > 0) {
    parts.push(
      `- Feeds read: ${ok} of ${report.feedOutcomes.length}` +
        (failedFeeds.length > 0
          ? `; failed: ${failedFeeds.map((f) => `${f.outlet} (${f.status})`).join(", ")}`
          : "")
    )
  }
  const f = report.funnel
  if (f !== undefined) {
    parts.push(
      `- Funnel: ${f.items} items → ${f.news} news → ${f.candidates} candidate pairs → ` +
        `${f.matches} matches → ${f.clusters} clusters` +
        (f.repeats > 0 ? ` (${f.repeats} already printed, set aside)` : "") +
        ` → ${f.selected} selected → ${f.published} published`
    )
  }
  for (const b of report.blobs ?? []) {
    parts.push(
      `- Blob set aside unprinted: ${b.itemCount} items across ${b.outletCount} outlets, ` +
        `match density ${b.density.toFixed(2)} — below the 0.5 floor, not one story`
    )
  }
  for (const d of report.dropped) {
    parts.push(`- Story #${d.rank} dropped: ${d.reason}`)
  }
  for (const line of report.healthLines ?? []) {
    parts.push(`- ${line}`)
  }
  if (advisoryLines.length > 0) {
    parts.push(`- Advisories (recorded, not enforced):`)
    for (const a of advisoryLines) parts.push(`    - ${a}`)
  }
  parts.push("", "*The brief ends here.*", "")
  return parts.join("\n")
}

export const archiveBrief = (runId: string, content: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const dir = "archive"
    const path = `${dir}/${runId}.md`

    yield* fs.makeDirectory(dir, { recursive: true }).pipe(Effect.orDie)
    const exists = yield* fs.exists(path).pipe(Effect.orDie)
    if (exists) {
      if (process.env["ETO_REPUBLISH"] === "1") {
        yield* Effect.logWarning(
          `ETO_REPUBLISH=1: overwriting ${path} (development escape hatch)`
        )
      } else {
        return yield* new BriefAlreadyPublished({ date: runId, path })
      }
    }

    const tmp = `${dir}/.${runId}.md.tmp`
    yield* fs.writeFileString(tmp, content).pipe(Effect.orDie)
    yield* fs.rename(tmp, path).pipe(Effect.orDie)
    return path
  }).pipe(Effect.withSpan("stage10.archiveBrief"))
