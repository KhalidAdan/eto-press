/**
 * The published-edition store — the archive's queryable shadow.
 *
 * The archive markdown is the constitutional record; this store is the
 * same edition as structured rows, so the site, email, and RSS dialects
 * read one engine-agnostic table instead of reconstructing editions from
 * any engine's private working tables. One writer (the frame, after the
 * archive write succeeds), one reader (assemble). Same edition, same
 * words, every door.
 */
import { SqlClient } from "@effect/sql"
import { Effect } from "effect"
import type { EditionStory, LinkItem, SourceLink } from "./edition.js"
import { editionStoryFrom } from "./edition.js"

export interface PublishedRow {
  readonly run_id: string
  readonly position: number
  readonly headline: string
  readonly body: string
  readonly differ: string
  readonly sources_line: string
  readonly source_links: string
  readonly balance_note: string | null
  readonly fold_reason: string | null
  readonly engine_ref: string | null
  readonly byline: string | null
  readonly link_items: string | null
}

export const toRow = (
  runId: string,
  position: number,
  story: EditionStory
): PublishedRow => ({
  run_id: runId,
  position,
  headline: story.headline,
  body: story.body,
  differ: story.differ,
  sources_line: story.sourcesLine,
  source_links: JSON.stringify(story.sources),
  balance_note: story.balanceNote,
  fold_reason: story.foldReason,
  engine_ref: story.engineRef ?? null,
  byline: story.byline ?? null,
  link_items:
    story.links !== undefined && story.links.length > 0
      ? JSON.stringify(story.links)
      : null
})

/** Rebuild the full story from a row. The split forms are re-derived by the
 * same constructor both writers of the document use; the links come back
 * exactly as resolved at publish time. */
export const fromRow = (row: PublishedRow): EditionStory => {
  const links = JSON.parse(row.source_links) as ReadonlyArray<SourceLink>
  const derived = editionStoryFrom({
    headline: row.headline,
    body: row.body,
    differ: row.differ,
    sourcesLine: row.sources_line,
    balanceNote: row.balance_note,
    foldReason: row.fold_reason,
    linkByOutlet: new Map(),
    engineRef: row.engine_ref,
    byline: row.byline,
    links:
      row.link_items === null
        ? []
        : (JSON.parse(row.link_items) as ReadonlyArray<LinkItem>)
  })
  return { ...derived, sources: links }
}

/** The frame's write: idempotent per (run_id, position), so a retried
 * morning re-publishes identically rather than duplicating. */
export const persistPublishedStories = (
  runId: string,
  stories: ReadonlyArray<EditionStory>
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`DELETE FROM published_stories WHERE run_id = ${runId}`
    for (const [i, story] of stories.entries()) {
      yield* sql`INSERT INTO published_stories ${sql.insert(
        toRow(runId, i + 1, story) as unknown as Record<string, unknown>
      )}`
    }
  }).pipe(Effect.withSpan("stage10.persistPublishedStories"))
