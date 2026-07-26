/**
 * Shared journal assembly: turn a published run into renderable stories.
 * Used by the site renderer and the email edition — one source of truth
 * for what a published story looks like outside the press.
 */
import Database from "better-sqlite3"
import {
  resolveSourceLinks,
  splitDiffer,
  splitParagraphs,
  type HtmlStory
} from "./html.js"

export type Journal = InstanceType<typeof Database>

export const openJournal = (): Journal => {
  const db = new Database("db/eto.sqlite")
  // Standalone scripts may run before the pipeline's migrations do.
  db.exec(`CREATE TABLE IF NOT EXISTS corrections (
    id INTEGER PRIMARY KEY AUTOINCREMENT, edition TEXT NOT NULL,
    story_rank INTEGER NOT NULL, note TEXT NOT NULL,
    created_at TEXT NOT NULL, printed_in TEXT
  )`)
  return db
}

/** Corrections that PRINTED in a given edition — for that edition's page. */
export const correctionsPrintedIn = (db: Journal, runId: string) =>
  (db
    .prepare(
      `SELECT c.edition AS edition, c.note AS note,
              COALESCE(MAX(d.headline), 'story #' || c.story_rank) AS headline
       FROM corrections c
       LEFT JOIN stories s ON s.run_id = c.edition AND s.rank = c.story_rank AND s.status = 'published'
       LEFT JOIN drafts d ON d.cluster_hash = s.cluster_hash
       WHERE c.printed_in = ?
       GROUP BY c.id ORDER BY c.id`
    )
    .all(runId) as Array<{ edition: string; headline: string; note: string }>)

/** Source-health trends: the §6/§8 instrument panel, printed not advised. */
export const healthLines = (db: Journal): Array<string> => {
  const lines: Array<string> = []
  const runs = db
    .prepare("SELECT DISTINCT run_id FROM feed_fetches ORDER BY run_id DESC LIMIT 7")
    .all() as Array<{ run_id: string }>
  if (runs.length > 0) {
    const oldest = runs[runs.length - 1]!.run_id
    const feeds = db
      .prepare(
        `SELECT outlet, COUNT(*) AS total, SUM(status = 'ok') AS ok
         FROM feed_fetches WHERE run_id >= ? GROUP BY outlet HAVING ok < total ORDER BY ok * 1.0 / total`
      )
      .all(oldest) as Array<{ outlet: string; total: number; ok: number }>
    if (feeds.length > 0) {
      lines.push(
        `Feed health (last ${runs.length} runs): ` +
          feeds.map((f) => `${f.outlet} ${f.ok}/${f.total} ok`).join(" · ")
      )
    }
  }
  const articles = db
    .prepare(
      `SELECT i.outlet AS outlet, COUNT(*) AS total, SUM(a.status = 'ok') AS ok
       FROM articles a JOIN items i ON i.id = a.item_id
       GROUP BY i.outlet HAVING total >= 5 AND ok * 1.0 / total < 0.8
       ORDER BY ok * 1.0 / total`
    )
    .all() as Array<{ outlet: string; total: number; ok: number }>
  if (articles.length > 0) {
    lines.push(
      "Article access: " +
        articles.map((a) => `${a.outlet} ${a.ok}/${a.total} readable`).join(" · ")
    )
  }
  return lines
}

export interface AssembledStory {
  readonly story: HtmlStory
  readonly clusterHash: string
}

export const publishedRuns = (db: Journal): Array<string> =>
  (db
    .prepare(
      "SELECT DISTINCT run_id FROM stories WHERE status = 'published' ORDER BY run_id DESC"
    )
    .all() as Array<{ run_id: string }>).map((r) => r.run_id)

export const assembleStories = (
  db: Journal,
  runId: string
): Array<AssembledStory> => {
  const rows = db
    .prepare(
      "SELECT cluster_hash, rank, balance_note, fold_reason FROM stories WHERE run_id = ? AND status = 'published' ORDER BY rank"
    )
    .all(runId) as Array<{
    cluster_hash: string
    rank: number
    balance_note: string | null
    fold_reason: string | null
  }>

  return rows.flatMap((row) => {
    const draft = db
      .prepare(
        "SELECT headline, body, differ, sources_line FROM drafts WHERE cluster_hash = ? ORDER BY created_at DESC, attempt DESC LIMIT 1"
      )
      .get(row.cluster_hash) as
      | { headline: string; body: string; differ: string; sources_line: string }
      | undefined
    if (draft === undefined) return []

    const accounts = db
      .prepare(
        `SELECT i.outlet AS outlet, i.link AS link, length(a.text) AS len
         FROM cluster_items ci
         JOIN items i ON i.id = ci.item_id
         JOIN articles a ON a.item_id = i.id AND a.status = 'ok'
         WHERE ci.run_id = ? AND ci.cluster_hash = ?`
      )
      .all(runId, row.cluster_hash) as Array<{ outlet: string; link: string; len: number }>
    const linkByOutlet = new Map<string, string>()
    for (const a of accounts.sort((x, y) => x.len - y.len)) {
      linkByOutlet.set(a.outlet, a.link)
    }

    const differ = splitDiffer(draft.differ)
    return [
      {
        clusterHash: row.cluster_hash,
        story: {
          headline: draft.headline,
          bodyParagraphs: splitParagraphs(draft.body),
          differBullets: differ.bullets,
          differParagraphs: differ.paragraphs,
          sources: resolveSourceLinks(draft.sources_line, linkByOutlet),
          balanceNote: row.balance_note,
          foldReason: row.fold_reason
        }
      }
    ]
  })
}

export const reportFor = (db: Journal, runId: string, storyCount: number) => {
  const feeds = db
    .prepare("SELECT status, outlet FROM feed_fetches WHERE run_id = ?")
    .all(runId) as Array<{ status: string; outlet: string }>
  const failed = feeds.filter((f) => f.status !== "ok")
  const dropped = db
    .prepare(
      "SELECT rank, reason FROM stories WHERE run_id = ? AND status = 'dropped' ORDER BY rank"
    )
    .all(runId) as Array<{ rank: number; reason: string }>
  return {
    feedsLine:
      `Feeds read: ${feeds.length - failed.length} of ${feeds.length}` +
      (failed.length > 0
        ? ` — failed: ${[...new Set(failed.map((f) => f.outlet))].join(", ")}`
        : ""),
    funnelLine: `${storyCount} stories published, ${dropped.length} dropped — the full record is archive/${runId}.md`,
    droppedLines: dropped.map((d) => `Story #${d.rank} dropped: ${d.reason}`)
  }
}
