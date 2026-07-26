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
import type { Draft } from "./composite.js"
import { BriefAlreadyPublished } from "./errors.js"
import type { FeedOutcome } from "./feeds.js"
import type { Story } from "./select.js"

export interface PublishedStory {
  readonly story: Story
  readonly draft: Draft
  readonly advisories: ReadonlyArray<string>
}

export interface CorrectionNotice {
  readonly edition: string
  readonly storyRank: number
  readonly headline: string
  readonly note: string
}

export interface RunReport {
  readonly feedOutcomes: ReadonlyArray<FeedOutcome>
  readonly funnel: {
    readonly items: number
    readonly news: number
    readonly candidates: number
    readonly matches: number
    readonly clusters: number
    readonly selected: number
    readonly published: number
  }
  readonly dropped: ReadonlyArray<{ readonly rank: number; readonly reason: string }>
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
  runId: string,
  published: ReadonlyArray<PublishedStory>,
  report: RunReport,
  corrections: ReadonlyArray<CorrectionNotice> = []
): string => {
  const parts: Array<string> = [
    `# eto — ${longDate(runId)}`,
    "",
    "*One story. Every side. Then it ends.*",
    ""
  ]

  // Corrections lead the edition (NORTH-STAR §9): dated, pointing back,
  // never reaching into the archive.
  if (corrections.length > 0) {
    parts.push("---", "", "## Corrections", "")
    for (const c of corrections) {
      parts.push(
        `In the edition of ${longDate(c.edition)}, the story "${c.headline}": ${c.note} ` +
          `The original stands unchanged in [the archive](${c.edition}.md).`
      )
      parts.push("")
    }
  }

  const mains = published.filter((p) => p.story.foldReason === null)
  const fold = published.find((p) => p.story.foldReason !== null)

  const pushStory = (p: PublishedStory) => {
    parts.push(`## ${p.draft.headline}`, "", p.draft.body, "")
    parts.push("**Where the accounts differ**", "", p.draft.differ, "")
    parts.push(`**Sources**  ${p.draft.sourcesLine}`)
    if (p.story.balanceNote !== null) {
      parts.push("", `*${p.story.balanceNote}*`)
    }
    parts.push("")
  }

  for (const p of mains) {
    parts.push("---", "")
    pushStory(p)
  }

  if (fold !== undefined) {
    parts.push("---", "", "## Below the fold", "")
    parts.push(
      "*One nomination from outside the front page. The model's printed reason — judge it:*"
    )
    parts.push(`*${fold.story.foldReason}*`, "")
    pushStory(fold)
  }

  if (published.length === 0) {
    parts.push("---", "", "Nothing to print today: no event was covered by")
    parts.push("two or more of your sources within the window. That is a")
    parts.push("measurement, not a malfunction.", "")
  }

  const ok = report.feedOutcomes.filter((o) => o.status === "ok").length
  const failedFeeds = report.feedOutcomes.filter((o) => o.status !== "ok")
  parts.push("---", "", "## The run, reported", "")
  parts.push(
    `- Feeds read: ${ok} of ${report.feedOutcomes.length}` +
      (failedFeeds.length > 0
        ? `; failed: ${failedFeeds.map((f) => `${f.outlet} (${f.status})`).join(", ")}`
        : "")
  )
  const f = report.funnel
  parts.push(
    `- Funnel: ${f.items} items → ${f.news} news → ${f.candidates} candidate pairs → ` +
      `${f.matches} matches → ${f.clusters} clusters → ${f.selected} selected → ` +
      `${f.published} published`
  )
  for (const d of report.dropped) {
    parts.push(`- Story #${d.rank} dropped: ${d.reason}`)
  }
  for (const line of report.healthLines ?? []) {
    parts.push(`- ${line}`)
  }
  const advisories = published.flatMap((p) =>
    p.advisories.map((a) => `${p.draft.headline.slice(0, 40)}…: ${a}`)
  )
  if (advisories.length > 0) {
    parts.push(`- Advisories (recorded, not enforced):`)
    for (const a of advisories) parts.push(`    - ${a}`)
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
