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
 *
 * Since generation 3 the archive renders a PAPER: sections bound into one
 * morning. A paper with one section and no absences renders exactly what
 * generation 2 rendered — same headings, same report, same last line —
 * which is the compatibility promise every existing archive relies on.
 * A paper with more than one section steps every heading down one level
 * and labels each desk.
 */
import { FileSystem } from "@effect/platform"
import { Effect } from "effect"
import type {
  AbsentSection,
  Draft,
  EditionCorrection,
  EditionDocument,
  EditionStory,
  PaperEdition,
  PaperSection,
  RunReport,
  Story
} from "./edition.js"
import { PAPER_MOTTO, PAPER_NAME } from "./config.js"
import { BriefAlreadyPublished } from "./errors.js"

export type { RunReport } from "./edition.js"

export interface PublishedStory {
  readonly story: Story
  readonly draft: Draft
  readonly advisories: ReadonlyArray<string>
}

export type CorrectionNotice = EditionCorrection

const longDate = (runId: string): string =>
  new Date(`${runId}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  })

/** The correction notice, one line, pointing back (NORTH-STAR §9). */
const correctionLine = (c: EditionCorrection): string =>
  `In the edition of ${longDate(c.edition)}, the story "${c.headline}": ${c.note} ` +
  `The original stands unchanged in [the archive](${c.edition}.md).`

/** The archive prints the compositor's text verbatim — the raw fields,
 * never the split form. The record is what was written, not a re-layout.
 * Differ and sources are anatomy some engines guarantee (eto's cage
 * does) and others never produce (a desk entry has no accounts). */
const pushStory = (parts: Array<string>, s: EditionStory, h: string): void => {
  parts.push(`${h} ${s.headline}`, "")
  if (s.byline !== undefined && s.byline !== null) {
    parts.push(`*By ${s.byline}*`, "")
  }
  if (s.body.trim() !== "") parts.push(s.body, "")
  for (const row of s.data ?? []) {
    parts.push(`- **${row.label}**  ${row.value}${row.note !== null ? ` (${row.note})` : ""}`)
  }
  if ((s.data ?? []).length > 0) parts.push("")
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

/** One section's stories: the mains, then the fold, then the quiet-page
 * note when the section printed nothing. `h` is the story heading level
 * ("##" on a single-section paper, "###" under a section heading). */
const pushSectionStories = (
  parts: Array<string>,
  stories: ReadonlyArray<EditionStory>,
  h: string
): void => {
  const mains = stories.filter((s) => s.foldReason === null)
  const fold = stories.find((s) => s.foldReason !== null)

  for (const s of mains) {
    parts.push("---", "")
    pushStory(parts, s, h)
  }

  if (fold !== undefined) {
    parts.push("---", "", `${h} Below the fold`, "")
    parts.push(
      "*One nomination from outside the front page. The model's printed reason — judge it:*"
    )
    parts.push(`*${fold.foldReason}*`, "")
    pushStory(parts, fold, h)
  }

  if (stories.length === 0) {
    parts.push("---", "", "Nothing to print today: no event was covered by")
    parts.push("two or more of your sources within the window. That is a")
    parts.push("measurement, not a malfunction.", "")
  }
}

/** The run, reported — one section's lines. `prefix` names the section on
 * a multi-section paper ("Business: "); empty on a single-section one. */
const pushReportLines = (
  parts: Array<string>,
  report: RunReport,
  advisoryLines: ReadonlyArray<string>,
  prefix: string
): void => {
  const ok = report.feedOutcomes.filter((o) => o.status === "ok").length
  const failedFeeds = report.feedOutcomes.filter((o) => o.status !== "ok")
  if (report.feedOutcomes.length > 0) {
    parts.push(
      `- ${prefix}Feeds read: ${ok} of ${report.feedOutcomes.length}` +
        (failedFeeds.length > 0
          ? `; failed: ${failedFeeds.map((f) => `${f.outlet} (${f.status})`).join(", ")}`
          : "")
    )
  }
  const f = report.funnel
  if (f !== undefined) {
    parts.push(
      `- ${prefix}Funnel: ${f.items} items → ${f.news} news → ${f.candidates} candidate pairs → ` +
        `${f.matches} matches → ${f.clusters} clusters` +
        (f.repeats > 0 ? ` (${f.repeats} already printed, set aside)` : "") +
        ` → ${f.selected} selected → ${f.published} published`
    )
  }
  for (const b of report.blobs ?? []) {
    parts.push(
      `- ${prefix}Blob set aside unprinted: ${b.itemCount} items across ${b.outletCount} outlets, ` +
        `match density ${b.density.toFixed(2)} — below the 0.5 floor, not one story`
    )
  }
  for (const d of report.dropped) {
    parts.push(`- ${prefix}Story #${d.rank} dropped: ${d.reason}`)
  }
  for (const line of report.healthLines ?? []) {
    parts.push(`- ${prefix}${line}`)
  }
  if (advisoryLines.length > 0) {
    parts.push(`- ${prefix}Advisories (recorded, not enforced):`)
    for (const a of advisoryLines) parts.push(`    - ${a}`)
  }
}

/** The whole morning as markdown: the paper's record. */
export const renderPaper = (paper: PaperEdition): string => {
  const parts: Array<string> = [
    `# ${PAPER_NAME} — ${longDate(paper.runId)}`,
    "",
    `*${PAPER_MOTTO}*`,
    ""
  ]

  // Corrections lead the edition (NORTH-STAR §9): dated, pointing back,
  // never reaching into the archive.
  if (paper.corrections.length > 0) {
    parts.push("---", "", "## Corrections", "")
    for (const c of paper.corrections) {
      parts.push(correctionLine(c))
      parts.push("")
    }
  }

  // One section, nothing absent: the generation-2 page, unchanged.
  const single = paper.sections.length === 1 && paper.absent.length === 0
  if (single) {
    const only = paper.sections[0]!
    pushSectionStories(parts, only.stories, "##")
    parts.push("---", "", "## The run, reported", "")
    pushReportLines(parts, only.report, only.advisoryLines, "")
    parts.push("", "*The brief ends here.*", "")
    return parts.join("\n")
  }

  // Several desks: each labeled, its stories one heading level down.
  for (const section of paper.sections) {
    parts.push("---", "", `## ${section.name}`, "")
    pushSectionStories(parts, section.stories, "###")
    parts.push(`*${section.name} ends here.*`, "")
  }

  if (paper.absent.length > 0) {
    parts.push("---", "", "## Not printed this morning", "")
    for (const a of paper.absent) {
      parts.push(`- ${a.name}: ${a.reason}`)
    }
    parts.push("")
  }

  parts.push("---", "", "## The run, reported", "")
  for (const section of paper.sections) {
    pushReportLines(parts, section.report, section.advisoryLines, `${section.name}: `)
  }
  for (const a of paper.absent) {
    parts.push(`- ${a.name}: did not print — ${a.reason}`)
  }
  parts.push("", "*The paper ends here.*", "")
  return parts.join("\n")
}

/** The generation-2 signature: one section's edition, rendered as the
 * whole page. Kept for the flagship binding and for engines' tests. */
export const renderBrief = (
  doc: EditionDocument,
  report: RunReport,
  advisoryLines: ReadonlyArray<string> = []
): string =>
  renderPaper({
    runId: doc.runId,
    sections: [
      { slug: "brief", name: "Brief", stories: doc.stories, report, advisoryLines }
    ],
    absent: [],
    corrections: doc.corrections
  })

export type { AbsentSection, PaperEdition, PaperSection }

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
