/**
 * Stage 2 (pure parts): item shape, HTML stripping, deterministic
 * classification. Experiment 002 failure mode 2: opinion/video/podcast/live
 * items act as glue between unrelated clusters — only `news` items may
 * participate in event matching, and these functions decide which is which
 * with no model involved.
 */

export type ItemKind = "news" | "opinion" | "video" | "podcast" | "liveblog"

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
  return "news"
}
