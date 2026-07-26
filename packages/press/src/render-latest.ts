/**
 * Stage 12, standalone: render the most recent published edition from the
 * journal to site/<date>.html and site/index.html (the latest pointer).
 * Run: npm run render  (builds CSS first)
 *
 * The markdown archive remains the canonical record; these pages are the
 * paper's public dress. Sources link to the accounts actually read.
 */
import Database from "better-sqlite3"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import * as TOML from "smol-toml"
import {
  renderEditionHtml,
  renderSourcesPage,
  resolveSourceLinks,
  splitDiffer,
  splitParagraphs,
  type HtmlStory
} from "./html.js"

const db = new Database("db/eto.sqlite")

const latest = db
  .prepare(
    "SELECT run_id FROM stories WHERE status = 'published' ORDER BY run_id DESC LIMIT 1"
  )
  .get() as { run_id: string } | undefined
if (!latest) {
  console.error("no published edition in the journal")
  process.exit(1)
}
const runId = latest.run_id

const storyRows = db
  .prepare(
    "SELECT cluster_hash, rank, balance_note FROM stories WHERE run_id = ? AND status = 'published' ORDER BY rank"
  )
  .all(runId) as Array<{ cluster_hash: string; rank: number; balance_note: string | null }>

const stories: Array<HtmlStory> = storyRows.map((row) => {
  const draft = db
    .prepare(
      "SELECT headline, body, differ, sources_line FROM drafts WHERE cluster_hash = ? ORDER BY created_at DESC, attempt DESC LIMIT 1"
    )
    .get(row.cluster_hash) as {
    headline: string
    body: string
    differ: string
    sources_line: string
  }

  // The account each outlet contributed: the fetched article with the most
  // text (mirrors the compositor's own account selection).
  const accountRows = db
    .prepare(
      `SELECT i.outlet AS outlet, i.link AS link, length(a.text) AS len
       FROM cluster_items ci
       JOIN items i ON i.id = ci.item_id
       JOIN articles a ON a.item_id = i.id AND a.status = 'ok'
       WHERE ci.run_id = ? AND ci.cluster_hash = ?`
    )
    .all(runId, row.cluster_hash) as Array<{ outlet: string; link: string; len: number }>
  const linkByOutlet = new Map<string, string>()
  for (const a of accountRows.sort((x, y) => x.len - y.len)) {
    linkByOutlet.set(a.outlet, a.link) // later (longer) wins
  }

  const differ = splitDiffer(draft.differ)
  return {
    headline: draft.headline,
    bodyParagraphs: splitParagraphs(draft.body),
    differBullets: differ.bullets,
    differParagraphs: differ.paragraphs,
    sources: resolveSourceLinks(draft.sources_line, linkByOutlet),
    balanceNote: row.balance_note
  }
})

const feeds = db
  .prepare(
    "SELECT status, outlet FROM feed_fetches WHERE run_id = ?"
  )
  .all(runId) as Array<{ status: string; outlet: string }>
const failed = feeds.filter((f) => f.status !== "ok")
const dropped = db
  .prepare(
    "SELECT rank, reason FROM stories WHERE run_id = ? AND status = 'dropped' ORDER BY rank"
  )
  .all(runId) as Array<{ rank: number; reason: string }>

const html = renderEditionHtml({
  runId,
  editionLabel: "",
  stories,
  report: {
    feedsLine:
      `Feeds read: ${feeds.length - failed.length} of ${feeds.length}` +
      (failed.length > 0
        ? ` — failed: ${[...new Set(failed.map((f) => f.outlet))].join(", ")}`
        : ""),
    funnelLine: `${stories.length} stories published, ${dropped.length} dropped — the full record is archive/${runId}.md`,
    droppedLines: dropped.map((d) => `Story #${d.rank} dropped: ${d.reason}`)
  }
})

// The sources page, straight from the masthead file — spectrum order.
const masthead = TOML.parse(readFileSync("sources.toml", "utf8")) as {
  source: Array<{ name: string; side: string }>
}
const SIDE_ORDER = ["left", "lean-left", "center", "lean-right", "right"]
const bySide = SIDE_ORDER.flatMap((side) => {
  const outlets = masthead.source.filter((s) => s.side === side).map((s) => s.name)
  return outlets.length > 0 ? [{ side, outlets }] : []
})
// Sides outside the known order (the editor may invent labels) go last.
for (const s of masthead.source) {
  if (!SIDE_ORDER.includes(s.side)) {
    const existing = bySide.find((g) => g.side === s.side)
    if (existing) (existing.outlets as Array<string>).push(s.name)
    else bySide.push({ side: s.side, outlets: [s.name] })
  }
}

mkdirSync("site", { recursive: true })
writeFileSync(`site/${runId}.html`, html, "utf8")
writeFileSync("site/index.html", html, "utf8")
writeFileSync("site/sources.html", renderSourcesPage(bySide), "utf8")
console.log(`rendered site/${runId}.html, site/index.html, site/sources.html (${stories.length} stories, ${stories.reduce((n, s) => n + s.sources.filter((x) => x.href).length, 0)} linked sources)`)
