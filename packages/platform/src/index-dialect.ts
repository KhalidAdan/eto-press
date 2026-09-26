/**
 * The fifth dialect: the index — the paper compressed, not advertised.
 *
 * On a sectioned paper the front page carries the first section in full
 * and then every other desk as one tight row per item: what it is, one
 * line that says what it says, and where it came from (NORTH-STAR, The
 * Shape of a Morning; the WSJ's "What's News" column is the print
 * ancestor). The same rows feed the morning email's section card, so the
 * page and the mail describe one object.
 *
 * Pure: rows are derived from the published stories' anatomy and nothing
 * else. A prose story is its headline and its first sentence (or its
 * deck, when the engine wrote one); a link-list story is one row per
 * link; a data-list story is the desk's board. No model is asked
 * anything here.
 */
import type { DataItem, EditionStory } from "./edition.js"

export interface IndexRow {
  /** A short label before the headline: a byline, the fold tag. */
  readonly kicker: string | null
  readonly headline: string
  readonly href: string
  /** The one-line deck under the headline; null when nothing honest
   * can stand there. */
  readonly deck: string | null
  /** Where it came from: the first source's name, or a link's domain. */
  readonly source: string | null
}

export interface IndexDesk {
  readonly slug: string
  readonly name: string
  /** The desk's own page or anchor. */
  readonly href: string
  /** The desk's figures, when it printed any (a wrap board's rows). */
  readonly board: ReadonlyArray<DataItem>
  readonly rows: ReadonlyArray<IndexRow>
  /** Items in the desk: rows plus board figures. */
  readonly count: number
}

/** The first sentence of a text, for a deck no engine wrote. */
export const firstSentence = (text: string): string | null => {
  const flat = text.replace(/\s+/g, " ").trim()
  if (flat === "") return null
  const m = flat.match(/^.+?[.!?](?=\s|$)/)
  const sentence = (m?.[0] ?? flat).trim()
  return sentence.length > 220 ? `${sentence.slice(0, 217).trimEnd()}…` : sentence
}

/** "https://www.example.org/a/b" → "example.org". */
export const sourceDomain = (href: string): string | null => {
  try {
    return new URL(href).hostname.replace(/^www\./, "")
  } catch {
    return null
  }
}

/** The rows one story contributes. */
export const rowsOf = (story: EditionStory, href: string): Array<IndexRow> => {
  const links = story.links ?? []
  if (links.length > 0) {
    return links.map((l) => ({
      kicker: null,
      headline: l.title,
      href: l.href,
      deck: l.note,
      source: sourceDomain(l.href)
    }))
  }
  if (story.body.trim() === "" && (story.data ?? []).length > 0) return []
  const kicker =
    story.byline !== undefined && story.byline !== null
      ? `By ${story.byline}`
      : story.foldReason !== null
        ? "Below the fold"
        : null
  return [
    {
      kicker,
      headline: story.headline,
      href,
      deck: story.deck ?? firstSentence(story.body),
      source: story.sources[0]?.name ?? null
    }
  ]
}

/** The story anchor the edition page gives position `n` (html.ts). */
const anchor = (n: number): string => `s${n}`

/** Build the index of the given sections. `first` is the paper-global
 * position of the first story in the first given section — the front
 * page passes the sections after its lead, so it passes the lead's story
 * count plus one. Anchors follow the edition page: within a section the
 * mains, then the fold. */
export const buildIndex = (
  sections: ReadonlyArray<{
    readonly slug: string
    readonly name: string
    readonly stories: ReadonlyArray<EditionStory>
  }>,
  opts: {
    /** The whole-paper page: the fallback address for a desk and its stories. */
    readonly editionHref: string
    readonly first: number
    /** A desk's own page (generation 3's dated section pages). When given,
     * the desk and its rows link there; anchors are paper-global either
     * way, so #s7 is the same story on both pages. */
    readonly sectionHref?: ((slug: string) => string) | undefined
  }
): Array<IndexDesk> => {
  let position = opts.first
  return sections.map((section) => {
    const base = opts.sectionHref === undefined ? null : opts.sectionHref(section.slug)
    const mains = section.stories.filter((s) => s.foldReason === null)
    const folds = section.stories.filter((s) => s.foldReason !== null)
    const ordered = [...mains, ...folds]
    const rows: Array<IndexRow> = []
    const board: Array<DataItem> = []
    for (const story of ordered) {
      const href = `${base ?? opts.editionHref}#${anchor(position)}`
      position++
      board.push(...(story.data ?? []))
      rows.push(...rowsOf(story, href))
    }
    return {
      slug: section.slug,
      name: section.name,
      href: base ?? `${opts.editionHref}#${section.slug}`,
      board,
      rows,
      count: rows.length + board.length
    }
  })
}

/** A stable small hash — the same morning picks the same card on a
 * retry, without a journal row for it. */
export const stableHash = (s: string): number => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h
}

/** The morning email's one section card: which desk, this morning. Only
 * desks that printed are candidates, so a silent section is never
 * advertised; the run id decides, so a retried send mails the same card. */
export const pickCard = <D extends { readonly count: number }>(
  runId: string,
  desks: ReadonlyArray<D>
): D | null => {
  const printed = desks.filter((d) => d.count > 0)
  if (printed.length === 0) return null
  return printed[stableHash(runId) % printed.length]!
}

const esc = (s: string): string =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")

/** The index as site markup: semantic anatomy classes only, the skin
 * names appearance (brief.css). */
export const renderIndex = (desks: ReadonlyArray<IndexDesk>): string => {
  const shown = desks.filter((d) => d.count > 0)
  if (shown.length === 0) return ""
  const deskHtml = (d: IndexDesk): string => {
    const board =
      d.board.length === 0
        ? ""
        : `\n        <ul role="list" class="index__board instrument">\n${d.board
            .map(
              (f) =>
                `          <li class="index__figure"><span class="index__figure-label instrument--quiet">${esc(f.label)}</span> <span class="index__figure-value">${esc(f.value)}</span>${f.note !== null ? `<span class="index__figure-note instrument--quiet"> ${esc(f.note)}</span>` : ""}</li>`
            )
            .join("\n")}\n        </ul>`
    const rows =
      d.rows.length === 0
        ? ""
        : `\n        <ol class="index__rows">\n${d.rows
            .map(
              (r) =>
                `          <li class="index__row">${r.kicker === null ? "" : `<span class="index__kicker instrument instrument--label instrument--quiet">${esc(r.kicker)}</span> `}<a href="${esc(r.href)}" class="index__headline link">${esc(r.headline)}</a>${r.deck === null ? "" : `<span class="index__deck prose"> ${esc(r.deck)}</span>`}${r.source === null ? "" : `<span class="index__source instrument instrument--quiet"> ${esc(r.source)}</span>`}</li>`
            )
            .join("\n")}\n        </ol>`
    return `      <section class="index__desk">
        <h3 class="index__desk-label instrument instrument--label instrument--strong"><a href="${esc(d.href)}" class="link">${esc(d.name)}</a> <span class="index__count instrument--quiet">${d.count}</span></h3>${board}${rows}
        <p class="index__desk-end instrument instrument--quiet">${esc(d.name)} ends here.</p>
      </section>`
  }
  return `    <section class="index">
      <h2 class="index__label section-label instrument instrument--label instrument--strong">In today's paper</h2>
      <div class="index__desks">
${shown.map(deskHtml).join("\n")}
      </div>
    </section>`
}
