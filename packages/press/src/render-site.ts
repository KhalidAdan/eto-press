/**
 * Stage 12, standalone: render the whole public site from the journal —
 * every published edition at site/<date>.html, the home page at
 * site/index.html (North Star for readers, today's stories, past
 * editions), and sources.html from the masthead file.
 * Run: npm run render  (builds CSS first)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import * as TOML from "smol-toml"
import {
  assembleStories,
  correctionsPrintedIn,
  healthLines,
  openJournal,
  publishedRuns,
  reportFor,
  type AssembledStory
} from "./assemble.js"
import { renderFeedXml } from "./feed.js"
import {
  renderEditionHtml,
  renderHomePage,
  renderSourcesPage,
  storyAnchor,
  type HomeCard
} from "./html.js"

const UA = "eto/0.1 (+local news compositor; front-door reader)"

/** Render-time image check: only ship images that actually answer, so the
 * page needs no client-side fallback JavaScript. */
const imageAlive = async (src: string): Promise<boolean> => {
  try {
    const res = await fetch(src, {
      method: "HEAD",
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(8000),
      redirect: "follow"
    })
    return res.ok
  } catch {
    return false
  }
}

const db = openJournal()
const editions = publishedRuns(db)
if (editions.length === 0) {
  console.error("no published edition in the journal")
  process.exit(1)
}

mkdirSync("site", { recursive: true })

const health = healthLines(db)
const assembledByRun = new Map<string, Array<AssembledStory>>()
for (const runId of editions) {
  const assembled = assembleStories(db, runId)
  assembledByRun.set(runId, assembled)
  writeFileSync(
    `site/${runId}.html`,
    renderEditionHtml({
      runId,
      editionLabel: "",
      stories: assembled.map((a) => a.story),
      report: {
        ...reportFor(db, runId, assembled.length),
        ...(runId === editions[0] ? { healthLines: health } : {})
      },
      corrections: correctionsPrintedIn(db, runId)
    }),
    "utf8"
  )
}
const latestAssembled: Array<AssembledStory> = assembledByRun.get(editions[0]!) ?? []

// The RSS feed: one item per edition, whole brief inside, newest first.
writeFileSync(
  "site/feed.xml",
  renderFeedXml(
    editions.slice(0, 14).map((runId) => ({
      runId,
      stories: (assembledByRun.get(runId) ?? []).map((a) => a.story),
      corrections: correctionsPrintedIn(db, runId)
    }))
  ),
  "utf8"
)

// Home page cards: anchor order matches the edition page (mains, then fold).
const clusterMeta = db.prepare(
  "SELECT sides, outlet_count FROM clusters WHERE run_id = ? AND cluster_hash = ?"
)
const imageCandidates = db.prepare(
  `SELECT i.outlet AS outlet, a.og_image AS og, length(a.text) AS len
   FROM cluster_items ci
   JOIN items i ON i.id = ci.item_id
   JOIN articles a ON a.item_id = i.id AND a.status = 'ok'
   WHERE ci.run_id = ? AND ci.cluster_hash = ? AND a.og_image IS NOT NULL
   ORDER BY len DESC`
)

const mainsCount = latestAssembled.filter((a) => a.story.foldReason === null).length
let mainIdx = 0
let foldIdx = 0
const cards: Array<HomeCard> = []
for (const a of latestAssembled) {
  const isFold = a.story.foldReason !== null
  const anchor = isFold
    ? storyAnchor(mainsCount + ++foldIdx)
    : storyAnchor(++mainIdx)
  const meta = clusterMeta.get(editions[0], a.clusterHash) as
    | { sides: string; outlet_count: number }
    | undefined
  const candidates = imageCandidates.all(editions[0], a.clusterHash) as Array<{
    outlet: string
    og: string
    len: number
  }>
  let image: HomeCard["image"] = null
  for (const c of candidates) {
    if (await imageAlive(c.og)) {
      image = { src: c.og, credit: c.outlet }
      break
    }
  }
  cards.push({
    title: a.story.headline,
    anchor,
    fold: isFold,
    outletsLabel: meta
      ? `${meta.outlet_count} outlet${meta.outlet_count === 1 ? "" : "s"}`
      : `${a.story.sources.length} sources`,
    sides: meta ? meta.sides.split("/") : [],
    image
  })
}

writeFileSync(
  "site/index.html",
  renderHomePage({
    latestRunId: editions[0]!,
    headlines: cards,
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
  `rendered ${editions.length} edition(s), index.html, sources.html — latest: ${editions[0]} ` +
    `(${latestAssembled.length} stories, ${cards.filter((c) => c.image !== null).length} with images)`
)
