/**
 * The sports engine — the first paper with two corpus origins.
 *
 * From the desk: signed columns. A desk/*.md entry opens with its
 * headline and an optional byline line ("by: Mark"), and prints once as
 * a bylined story — the human voice, leading the edition.
 *
 * From the world: the leagues. The masthead's sources are leagues (the
 * `side` field names the section — "NBA", "Serie A"); their feeds are
 * the leagues' own front doors, and each morning's first-seen links
 * print as one link-list story per league. Results link to the record.
 *
 * Deliberately v0: no score tables, no figures, no email images — the
 * blocks this engine will eventually force are deferred until its
 * papers demand them (docs/CHANGELOG-GEN2.md). No models anywhere.
 */
import { SqlClient } from "@effect/sql"
import { Effect } from "effect"
import { createHash } from "node:crypto"
import { Desk, type DeskEntry } from "@eto-press/platform/desk"
import { editionStoryFrom, type EditionStory, type LinkItem } from "@eto-press/platform/edition"
import type { Day, EngineOutcome } from "@eto-press/platform/engine"
import { ingestAllFeeds } from "@eto-press/platform/feeds"
import { capText } from "@eto-press/platform/frontdoor"
import type { Classifier, Item } from "@eto-press/platform/normalize"

const everythingIsNews: Classifier = () => "news"
const LINKS_PER_LEAGUE = 6
const BLURB_CAP = 140

const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex")

/** A column: "# headline", an optional "by: Name" line, then the body. */
export const parseColumn = (
  entry: DeskEntry
): { headline: string; byline: string | null; body: string } => {
  const lines = entry.content.split(/\r?\n/)
  const headingAt = lines.findIndex((l) => /^#\s+\S/.test(l))
  const headline =
    headingAt >= 0
      ? lines[headingAt]!.replace(/^#\s+/, "").trim()
      : entry.file.replace(/\.md$/, "").replace(/[-_]+/g, " ").trim()
  const rest = headingAt >= 0 ? lines.slice(headingAt + 1) : lines
  const firstContent = rest.findIndex((l) => l.trim() !== "")
  const bylineMatch =
    firstContent >= 0 ? rest[firstContent]!.trim().match(/^by:?\s+(.+)$/i) : null
  const byline = bylineMatch?.[1]?.trim() ?? null
  const body = (byline !== null ? rest.slice(firstContent + 1) : rest).join("\n").trim()
  return { headline, byline, body }
}

export const toLeagueLink = (item: Item): LinkItem => {
  const blurb = item.summary.trim() === "" ? null : capText(item.summary, BLURB_CAP)
  return {
    title: item.title,
    href: item.link,
    note: blurb === null ? item.outlet : `${item.outlet} · ${blurb}`
  }
}

const edition = (day: Day) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const desk = yield* Desk

    const stories: Array<EditionStory> = []

    // -- the columns lead: the signed human voice -----------------------------
    const entries = yield* desk.entries
    for (const entry of entries) {
      const hash = sha256(entry.content)
      const ref = `sports:col:${hash}`
      const printed = yield* sql<{ one: number }>`
        SELECT 1 AS one FROM published_stories WHERE engine_ref = ${ref} LIMIT 1
      `
      if (printed.length > 0) continue
      const { headline, byline, body } = parseColumn(entry)
      stories.push(
        editionStoryFrom({
          headline,
          body,
          differ: "",
          sourcesLine: "",
          balanceNote: null,
          foldReason: null,
          linkByOutlet: new Map(),
          engineRef: ref,
          byline
        })
      )
      yield* Effect.logInfo(
        `  column: ${headline.slice(0, 60)}${byline !== null ? ` (by ${byline})` : ""}`
      )
    }

    // -- the leagues follow: first-seen links per section ---------------------
    const { items, outcomes } = yield* ingestAllFeeds(day.masthead, day.runId, everythingIsNews)
    const firstSeen = yield* sql<{ link: string }>`
      SELECT link FROM items WHERE run_id = ${day.runId}
    `
    const freshLinks = new Set(firstSeen.map((r) => r.link))
    const fresh = items.filter((i) => freshLinks.has(i.link))

    const seenLeague = new Set<string>()
    for (const league of day.masthead.source.map((s) => s.side)) {
      if (seenLeague.has(league)) continue
      seenLeague.add(league)
      const links = fresh
        .filter((i) => i.side === league)
        .slice(0, LINKS_PER_LEAGUE)
        .map(toLeagueLink)
      if (links.length === 0) continue
      const ref = `sports:${day.runId}:${league}`
      const printed = yield* sql<{ one: number }>`
        SELECT 1 AS one FROM published_stories WHERE engine_ref = ${ref} LIMIT 1
      `
      if (printed.length > 0) continue
      stories.push(
        editionStoryFrom({
          headline: league,
          body: "",
          differ: "",
          sourcesLine: "",
          balanceNote: null,
          foldReason: null,
          linkByOutlet: new Map(),
          engineRef: ref,
          links
        })
      )
      yield* Effect.logInfo(`  league ${league}: ${links.length} link(s)`)
    }

    if (stories.length === 0) {
      return {
        _tag: "NoEdition",
        reason: `no new columns and no new league links (${outcomes.length} feeds read)`
      } satisfies EngineOutcome
    }

    const columns = stories.filter((s) => s.byline !== null).length
    return {
      _tag: "Edition",
      stories,
      report: {
        feedOutcomes: outcomes,
        dropped: [],
        healthLines: [
          `${columns} column(s) from the desk; ${stories.length - columns} league section(s) from the world.`
        ]
      },
      advisoryLines: []
    } satisfies EngineOutcome
  }).pipe(Effect.withSpan("sports.edition"))

/** The sports engine: signed columns, the leagues' own links, no models. */
export const sportsEngine = {
  name: "sports",
  doctrine: [
    "The results are facts; the columns are signed.",
    "A byline means a human. The press never fakes one.",
    "Results link to the record; opinions link to their author.",
    "Nothing new, no edition. The off-season is quiet."
  ],
  models: [],
  edition
} as const
