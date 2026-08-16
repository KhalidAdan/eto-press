/**
 * Stage 2 (pure parts): the item shape and HTML stripping. Deciding what
 * KIND an item is (news, opinion, video…) is editorial — an engine's
 * classifier, injected into the feed ingest, never the platform's call.
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

/** What counts as which kind is an engine's editorial call, not the
 * platform's — the engine hands its classifier to the feed ingest. */
export type Classifier = (title: string, link: string) => ItemKind
