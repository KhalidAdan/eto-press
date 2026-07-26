/**
 * Stage 12, standalone: render the whole public site from the journal —
 * every published edition at site/<date>.html, the home page at
 * site/index.html (North Star for readers, today's stories, past
 * editions), and sources.html from the masthead file.
 * Run: npm run render  (builds CSS first)
 */
import Database from "better-sqlite3"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import * as TOML from "smol-toml"
import {
  renderEditionHtml,
  renderHomePage,
  renderSourcesPage,
  resolveSourceLinks,
  splitDiffer,
  splitParagraphs,
  storyAnchor,
  type HtmlStory
} from "./html.js"

const db = new Database("db/eto.sqlite")

const editions = (db
  .prepare(
    "SELECT DISTINCT run_id FROM stories WHERE status = 'published' ORDER BY run_id DESC"
  )
  .all() as Array<{ run_id: string }>).map((r) => r.run_id)

if (editions.length === 0) {
  console.error("no published edition in the journal")
  process.exit(1)
}

const assembleStories = (runId: string): Array<HtmlStory> => {
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
        headline: draft.headline,
        bodyParagraphs: splitParagraphs(draft.body),
        differBullets: differ.bullets,
        differParagraphs: differ.paragraphs,
        sources: resolveSourceLinks(draft.sources_line, linkByOutlet),
        balanceNote: row.balance_note,
        foldReason: row.fold_reason
      }
    ]
  })
}

const reportFor = (runId: string, storyCount: number) => {
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

mkdirSync("site", { recursive: true })

let latestStories: Array<HtmlStory> = []
for (const runId of editions) {
  const stories = assembleStories(runId)
  if (runId === editions[0]) latestStories = stories
  writeFileSync(
    `site/${runId}.html`,
    renderEditionHtml({
      runId,
      editionLabel: "",
      stories,
      report: reportFor(runId, stories.length)
    }),
    "utf8"
  )
}

// Home page: mains first (anchor order matches the edition page), fold last.
const mains = latestStories.filter((s) => s.foldReason === null)
const folds = latestStories.filter((s) => s.foldReason !== null)
writeFileSync(
  "site/index.html",
  renderHomePage({
    latestRunId: editions[0]!,
    headlines: [
      ...mains.map((s, i) => ({
        title: s.headline,
        anchor: storyAnchor(i + 1),
        fold: false
      })),
      ...folds.map((s, i) => ({
        title: s.headline,
        anchor: storyAnchor(mains.length + i + 1),
        fold: true
      }))
    ],
    editions
  }),
  "utf8"
)

// Sources page, straight from the masthead file — spectrum order.
const masthead = TOML.parse(readFileSync("sources.toml", "utf8")) as {
  source: Array<{ name: string; side: string }>
}
const SIDE_ORDER = ["left", "lean-left", "center", "lean-right", "right"]
const bySide = SIDE_ORDER.flatMap((side) => {
  const outlets = masthead.source.filter((s) => s.side === side).map((s) => s.name)
  return outlets.length > 0 ? [{ side, outlets }] : []
})
for (const s of masthead.source) {
  if (!SIDE_ORDER.includes(s.side)) {
    const existing = bySide.find((g) => g.side === s.side)
    if (existing) (existing.outlets as Array<string>).push(s.name)
    else bySide.push({ side: s.side, outlets: [s.name] })
  }
}
writeFileSync("site/sources.html", renderSourcesPage(bySide), "utf8")

console.log(
  `rendered ${editions.length} edition(s), index.html, sources.html — latest: ${editions[0]} (${latestStories.length} stories)`
)
