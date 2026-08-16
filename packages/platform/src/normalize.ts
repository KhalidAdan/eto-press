/**
 * Stage 2 (pure parts): item shape, HTML stripping, deterministic
 * classification. Experiment 002 failure mode 2: opinion/video/podcast/live
 * items act as glue between unrelated clusters — only `news` items may
 * participate in event matching, and these functions decide which is which
 * with no model involved.
 */

export type ItemKind = "news" | "opinion" | "video" | "podcast" | "liveblog" | "digest"

export interface Item {
  readonly id: number
  readonly outlet: string
  readonly side: string
  readonly kind: ItemKind
  readonly title: string
  readonly summary: string
  readonly link: string
  readonly publishedAt: Date
}

const TAG = /<[^>]+>/g

export const stripHtml = (html: string): string =>
  html.replace(TAG, " ").replace(/\s+/g, " ").trim()

/** Guardian-style opinion bylines: a trailing "| Firstname Lastname".
 * Later name-words may be lowercase particles — "Claire de Lune" slipped
 * through the first version of this regex on live data. */
const TRAILING_BYLINE = /\|\s*[A-Z][\w'’.-]+(\s+[\w'’.-]+){1,3}\s*$/

/** Named daily-digest formats seen gluing clusters on 2026-07-31: NPR's
 * "Morning news brief", Guardian's "First Thing:" and "Wednesday briefing:",
 * FOX's "...and more top headlines". */
const DIGEST_TITLE =
  /(\bnews brief\b)|(and more top headlines)|(^first thing:)|(^[\w\s]{0,12}briefing:)/i

/** Guardian liveblogs end "– business live" / "– Europe live"; Al Jazeera's
 * open with "Iran war live:". Neither form was caught by the ^live rule. */
const LIVEBLOG_SUFFIX = /[–—-]\s*[\w\s]*\blive\s*$/i
const LIVEBLOG_PREFIX = /^[^:]{0,40}\blive\b\s*:/i

const CAP_WORD = /\b[A-Z][\w'’.-]*\b/g
const CLAUSE_STOP = new Set(["The", "A", "An", "US", "GOP", "New", "In", "On", "After", "As"])

/** A semicolon joining two clauses that name disjoint subjects is a
 * two-story digest headline ("US hits Iran…; GOP senators delay Blanche…").
 * HTML entities (&#039;) are stripped first — their semicolons are not
 * clause boundaries. Single-story semicolons ("death toll climbs to 13;
 * rescue efforts continue") survive because one side names no subject. */
const isTwoStoryTitle = (title: string): boolean => {
  const t = title.replace(/&#?[0-9a-z]+;/gi, "'")
  const halves = t.split(/;\s/)
  if (halves.length !== 2) return false
  const subjects = halves.map(
    (h) => new Set((h.match(CAP_WORD) ?? []).filter((w) => !CLAUSE_STOP.has(w)))
  )
  if (subjects[0]!.size === 0 || subjects[1]!.size === 0) return false
  return ![...subjects[0]!].some((w) => subjects[1]!.has(w))
}

export const classify = (title: string, link: string): ItemKind => {
  const t = title.trim()
  const u = link.toLowerCase()
  if (u.includes("/opinion/") || u.includes("/commentisfree/")) return "opinion"
  if (/^opinion[:\s]/i.test(t) || TRAILING_BYLINE.test(t)) return "opinion"
  if (/[–—-]\s*(video|podcast)\s*$/i.test(t)) {
    return /podcast\s*$/i.test(t) ? "podcast" : "video"
  }
  if (/^watch:/i.test(t) || u.includes("/video/")) return "video"
  if (u.includes("/podcast")) return "podcast"
  if (/^live[: ]/i.test(t) || /live updates/i.test(t)) return "liveblog"
  if (/as it happened/i.test(t)) return "liveblog"
  if (LIVEBLOG_SUFFIX.test(t) || LIVEBLOG_PREFIX.test(t)) return "liveblog"
  if (DIGEST_TITLE.test(t) || isTwoStoryTitle(t)) return "digest"
  return "news"
}
