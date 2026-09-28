/**
 * Stage 12, standalone: render the whole public site from the journal —
 * every published edition at site/<date>.html (the whole paper), every
 * desk of a sectioned edition at site/<date>/<slug>/, the front page at
 * site/index.html (the lead as cards, the sign-up, the index of the other
 * desks, the calendar of past editions), the about page at sources.html from the
 * masthead file, the feeds — and the stylesheet and fonts beside them, so
 * site/ is the whole paper and depends on nothing outside it.
 * Run: eto render
 */
import { spawnSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import * as TOML from "smol-toml"
import {
  assembleStories,
  correctionsPrintedIn,
  groupBySection,
  healthLines,
  openJournal,
  publishedRuns,
  reportFor,
  type AssembledSection,
  type AssembledStory
} from "./assemble.js"
import { SECTIONED, SECTIONS } from "./config.js"
import { renderFeedXml } from "./feed.js"
import {
  renderEditionHtml,
  renderHomePage,
  renderSectionPage,
  renderSourcesPage,
  storyAnchor,
  type CalendarEdition,
  type HomeCard
} from "./html.js"
import { buildIndex, renderIndex } from "./index-dialect.js"

const db = openJournal()
const editions = publishedRuns(db)
if (editions.length === 0) {
  console.error("no published edition in the journal")
  process.exit(1)
}

mkdirSync("site", { recursive: true })

const health = healthLines(db)
const assembledByRun = new Map<string, Array<AssembledStory>>()
const groupsByRun = new Map<string, Array<AssembledSection>>()
const stories = (group: AssembledSection | undefined) => (group?.stories ?? []).map((a) => a.story)
const htmlSections = (groups: ReadonlyArray<AssembledSection>) =>
  groups.map((g) => ({ slug: g.slug, name: g.name, stories: stories(g) }))
/** A desk's dated page, relative to the site root. */
const sectionPath = (runId: string, slug: string) => `./${runId}/${slug}/`

let sectionPages = 0
for (const runId of editions) {
  const assembled = assembleStories(db, runId)
  const groups = groupBySection(assembled)
  assembledByRun.set(runId, assembled)
  groupsByRun.set(runId, groups)
  const corrections = correctionsPrintedIn(db, runId)

  // The whole paper, dated.
  writeFileSync(
    `site/${runId}.html`,
    renderEditionHtml({
      runId,
      editionLabel: "",
      stories: assembled.map((a) => a.story),
      sections: htmlSections(groups),
      report: {
        ...reportFor(db, runId, assembled.length),
        ...(runId === editions[0] ? { healthLines: health } : {})
      },
      corrections
    }),
    "utf8"
  )

  // Each desk at its own address, when the morning had more than one.
  if (groups.length > 1) {
    let first = 1
    for (const [i, group] of groups.entries()) {
      mkdirSync(`site/${runId}/${group.slug}`, { recursive: true })
      const prev = groups[i - 1]
      const next = groups[i + 1]
      writeFileSync(
        `site/${runId}/${group.slug}/index.html`,
        renderSectionPage({
          runId,
          section: { slug: group.slug, name: group.name, stories: stories(group) },
          first,
          position: i + 1,
          total: groups.length,
          prev: prev === undefined ? null : { slug: prev.slug, name: prev.name },
          next: next === undefined ? null : { slug: next.slug, name: next.name }
        }),
        "utf8"
      )
      first += group.stories.length
      sectionPages++
    }
  }
}

// The RSS feed at the link readers have always had: one item per edition,
// the paper's FIRST section inside (the brief, on the flagship), newest
// first. On a single-section paper that is the whole edition, unchanged.
const recent = editions.slice(0, 14)
const sectionStories = (runId: string, slug: string | null) => {
  const groups = groupsByRun.get(runId) ?? []
  return stories(slug === null ? groups[0] : groups.find((g) => g.slug === slug))
}
writeFileSync(
  "site/feed.xml",
  renderFeedXml(
    recent.map((runId) => ({
      runId,
      stories: sectionStories(runId, null),
      corrections: correctionsPrintedIn(db, runId)
    }))
  ),
  "utf8"
)
// Per-section feeds (generation 3), at /<slug>/feed.xml, for every desk
// the paper declares — the brief among them, so it is briefly served at
// two links. An edition where the desk was absent is not an item.
if (SECTIONS.length > 1) {
  for (const section of SECTIONS) {
    const withDesk = recent.filter((runId) => sectionStories(runId, section.slug).length > 0)
    mkdirSync(`site/${section.slug}`, { recursive: true })
    writeFileSync(
      `site/${section.slug}/feed.xml`,
      renderFeedXml(
        withDesk.map((runId) => ({
          runId,
          stories: sectionStories(runId, section.slug),
          corrections: []
        })),
        { path: `/${section.slug}/feed.xml`, section: { slug: section.slug, name: section.name } }
      ),
      "utf8"
    )
  }
}

// The front page: the lead section as cards (the skim), the sign-up, the
// index of every other desk side by side, the calendar of past editions,
// the feeds. The lead is read in full one click deeper: its desk page on
// a sectioned morning, the edition page otherwise.
const latest = editions[0]!
const latestGroups = groupsByRun.get(latest) ?? []
const lead = latestGroups[0]
const leadStories = stories(lead)
const others = latestGroups.slice(1)
const desks = buildIndex(htmlSections(others), {
  editionHref: `./${latest}.html`,
  first: leadStories.length + 1,
  sectionHref: (slug) => sectionPath(latest, slug)
})
const leadHref =
  latestGroups.length > 1 && lead !== undefined ? sectionPath(latest, lead.slug) : `./${latest}.html`

/** Render-time image check: only ship images that actually answer, so the
 * page needs no client-side fallback JavaScript. */
const imageAlive = async (src: string): Promise<boolean> => {
  try {
    const res = await fetch(src, {
      method: "HEAD",
      headers: { "user-agent": "eto/0.1 (+local news compositor; front-door reader)" },
      signal: AbortSignal.timeout(8000),
      redirect: "follow"
    })
    return res.ok
  } catch {
    return false
  }
}
// Card metadata from the eto engine's caches, when the story's ref still
// resolves (a lead on another engine simply gets typographic cards).
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
const leadAssembled = lead?.stories ?? []
const mainsCount = leadAssembled.filter((a) => a.story.foldReason === null).length
let mainIdx = 0
let foldIdx = 0
const cards: Array<HomeCard> = []
for (const a of [
  ...leadAssembled.filter((x) => x.story.foldReason === null),
  ...leadAssembled.filter((x) => x.story.foldReason !== null)
]) {
  const isFold = a.story.foldReason !== null
  const anchor = isFold ? storyAnchor(mainsCount + ++foldIdx) : storyAnchor(++mainIdx)
  const meta = clusterMeta.get(latest, a.clusterHash) as
    | { sides: string; outlet_count: number }
    | undefined
  const candidates = imageCandidates.all(latest, a.clusterHash) as Array<{ outlet: string; og: string }>
  let image: HomeCard["image"] = null
  for (const c of candidates) {
    if (await imageAlive(c.og)) {
      image = { src: c.og, credit: c.outlet }
      break
    }
  }
  cards.push({
    title: a.story.headline,
    href: `${leadHref}#${anchor}`,
    fold: isFold,
    outletsLabel: meta
      ? `${meta.outlet_count} outlet${meta.outlet_count === 1 ? "" : "s"}`
      : `${a.story.sources.length} source${a.story.sources.length === 1 ? "" : "s"}`,
    sides: meta ? meta.sides.split("/") : [],
    image
  })
}
const calendar: Array<CalendarEdition> = editions.map((runId) => {
  const groups = groupsByRun.get(runId) ?? []
  return {
    runId,
    lead: stories(groups[0])[0]?.headline ?? null,
    sections: groups.length
  }
})
writeFileSync(
  "site/index.html",
  renderHomePage({
    runId: latest,
    cards,
    leadName: SECTIONED && lead !== undefined ? lead.name : null,
    leadHref,
    counts: desks
      .filter((d) => d.count > 0)
      .map((d) => `${d.name} ${d.count}`)
      .join(" · "),
    // The skim: each desk's board and first five rows, then "Read all of".
    index: renderIndex(desks, { rowsPerDesk: 5 }),
    corrections: correctionsPrintedIn(db, latest),
    calendar,
    feeds: SECTIONS.length > 1 ? SECTIONS.map((s) => ({ name: s.name, path: `./${s.slug}/feed.xml` })) : []
  }),
  "utf8"
)

// The about page, straight from the masthead file — spectrum order. On a
// sectioned paper this is the FIRST section's file (the brief's, on the
// flagship).
const parsed = TOML.parse(readFileSync(SECTIONS[0]!.masthead, "utf8")) as {
  source?: Array<{ name: string; side: string }>
  seed?: { name: string; url?: string; version?: string; description?: string }
}
// A desk paper reads no outlets; its about page is simply short.
const masthead = { ...parsed, source: parsed.source ?? [] }
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
writeFileSync("site/sources.html", renderSourcesPage(bySide, masthead.seed ?? null), "utf8")

// The stylesheet: the paper's own brief.css if it has one (its skin —
// usually an @import of the default theme plus its own rules), else the
// default theme itself. Compiled here so no paper needs a build step.
const require = createRequire(import.meta.url)
const skin = existsSync("brief.css") ? "brief.css" : require.resolve("@eto-press/platform/brief.css")
const tailwind = join(dirname(require.resolve("@tailwindcss/cli/package.json")), "dist", "index.mjs")
const css = spawnSync(process.execPath, [tailwind, "-i", skin, "-o", "site/brief.css", "--minify"], {
  stdio: ["ignore", "ignore", "inherit"]
})
if (css.status !== 0) {
  console.error(`stylesheet failed to compile from ${skin}`)
  process.exit(1)
}

// The type, self-hosted: the woff2 files the default theme's @font-face
// rules name, copied from the OFL packages into site/fonts. A skin that
// uses other fonts simply never references these.
const FONT_FILES = [
  ["@fontsource-variable/lora", "lora-latin-wght-normal.woff2"],
  ["@fontsource-variable/lora", "lora-latin-wght-italic.woff2"],
  ["@fontsource-variable/lora", "lora-latin-ext-wght-normal.woff2"],
  ["@fontsource-variable/lora", "lora-latin-ext-wght-italic.woff2"],
  ["@fontsource/ibm-plex-mono", "ibm-plex-mono-latin-400-normal.woff2"],
  ["@fontsource/ibm-plex-mono", "ibm-plex-mono-latin-400-italic.woff2"],
  ["@fontsource/ibm-plex-mono", "ibm-plex-mono-latin-500-normal.woff2"],
  ["@fontsource/ibm-plex-mono", "ibm-plex-mono-latin-ext-400-normal.woff2"],
  ["@fontsource/ibm-plex-mono", "ibm-plex-mono-latin-ext-400-italic.woff2"],
  ["@fontsource/ibm-plex-mono", "ibm-plex-mono-latin-ext-500-normal.woff2"]
] as const
mkdirSync("site/fonts", { recursive: true })
for (const [pkg, file] of FONT_FILES) {
  copyFileSync(join(dirname(require.resolve(`${pkg}/package.json`)), "files", file), `site/fonts/${file}`)
}

console.log(
  `rendered ${editions.length} edition(s)${sectionPages > 0 ? `, ${sectionPages} section page(s)` : ""}, index.html, sources.html — latest: ${latest} ` +
    `(${leadStories.length} lead stories, ${others.length} other desk(s))`
)
