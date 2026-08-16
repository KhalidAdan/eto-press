/**
 * The desk engine — the null machinery. The editor writes markdown onto
 * the desk; the press prints it; that is the entire doctrine. No feeds,
 * no judging, no compositor, no models: a paper on this engine never
 * needs Ollama at all, and everything it inherits — the append-only
 * archive, the untracked readers, the finite edition, the mail — comes
 * from the platform's constitution, which is precisely the point.
 *
 * An entry is a desk/*.md file: an optional leading "# headline" line,
 * then the body. Each entry prints once — the engine journals a content
 * hash — and a morning with nothing new prints nothing at all
 * (NoEdition), which is the other thing this engine exists to prove.
 */
import { SqlClient } from "@effect/sql"
import { Effect } from "effect"
import { createHash } from "node:crypto"
import { Desk, type DeskEntry } from "@eto-press/platform/desk"
import { editionStoryFrom, type EditionStory } from "@eto-press/platform/edition"
import type { Day, EngineOutcome } from "@eto-press/platform/engine"

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex")

/** First "# " line is the headline; everything after it is the body. An
 * entry with no heading gets its filename, de-dashed, as the headline. */
export const parseEntry = (entry: DeskEntry): { headline: string; body: string } => {
  const lines = entry.content.split(/\r?\n/)
  const headingAt = lines.findIndex((l) => /^#\s+\S/.test(l))
  if (headingAt >= 0) {
    const headline = lines[headingAt]!.replace(/^#\s+/, "").trim()
    const body = lines.slice(headingAt + 1).join("\n").trim()
    return { headline, body }
  }
  const headline = entry.file
    .replace(/\.md$/, "")
    .replace(/^\d{4}-\d{2}-\d{2}[-_]?/, "")
    .replace(/[-_]+/g, " ")
    .trim()
  return { headline: headline || entry.file, body: entry.content.trim() }
}

const NO_LINKS: ReadonlyMap<string, string> = new Map()

const edition = (day: Day) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const desk = yield* Desk

    yield* sql`CREATE TABLE IF NOT EXISTS desk_printed (
      file TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      run_id TEXT NOT NULL,
      PRIMARY KEY (file, content_hash)
    )`

    const entries = yield* desk.entries
    const unprinted: Array<{ entry: DeskEntry; hash: string }> = []
    for (const entry of entries) {
      const hash = sha256(entry.content)
      const seen = yield* sql<{ n: number }>`
        SELECT COUNT(*) AS n FROM desk_printed
        WHERE file = ${entry.file} AND content_hash = ${hash}
      `
      if ((seen[0]?.n ?? 0) === 0) unprinted.push({ entry, hash })
    }

    if (unprinted.length === 0) {
      return {
        _tag: "NoEdition",
        reason: `the desk holds nothing new (${entries.length} entr${entries.length === 1 ? "y" : "ies"}, all printed)`
      } satisfies EngineOutcome
    }

    const stories: Array<EditionStory> = []
    for (const { entry, hash } of unprinted) {
      const { headline, body } = parseEntry(entry)
      stories.push(
        editionStoryFrom({
          headline,
          body,
          differ: "",
          sourcesLine: "",
          balanceNote: null,
          foldReason: null,
          linkByOutlet: NO_LINKS,
          engineRef: `desk:${hash}`
        })
      )
      yield* sql`INSERT INTO desk_printed ${sql.insert({
        file: entry.file,
        content_hash: hash,
        run_id: day.runId
      })}`
      yield* Effect.logInfo(`  from the desk: ${headline.slice(0, 70)} (${entry.file})`)
    }

    return {
      _tag: "Edition",
      stories,
      report: {
        feedOutcomes: [],
        dropped: [],
        healthLines: [
          `Printed from the desk: ${stories.length} entr${stories.length === 1 ? "y" : "ies"}. Nothing fetched, nothing modeled.`
        ]
      },
      advisoryLines: []
    } satisfies EngineOutcome
  }).pipe(Effect.withSpan("desk.edition"))

/** The desk engine: the editor writes, the press prints. */
export const deskEngine = {
  name: "desk",
  doctrine: [
    "The editor writes; the press prints.",
    "The desk is the whole corpus: nothing fetched, nothing generated.",
    "An empty desk prints nothing. Silence over filler."
  ],
  models: [],
  edition
} as const
