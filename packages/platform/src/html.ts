/**
 * The site's templates — eto's visual dogma, encoded.
 *
 * The rules this file enforces (built with the ui.sh design skills in
 * .claude/skills/design; change them only the way you'd change the
 * masthead — deliberately):
 *
 * 1. TWO TYPEFACES, TWO VOICES. The news is Lora, an editorial serif —
 *    headlines and body alike, one fabric. Everything that is eto
 *    speaking rather than the news — tagline, date, the differ label,
 *    sources, balance notes, the run report — is IBM Plex Mono: the
 *    instrument voice.
 * 2. ONE COLOR, SPENT IN ONE PLACE. Ink on paper (neutral-950 / white,
 *    inverted for dark). The single claret accent belongs exclusively to
 *    the paper's own voice: the differ label, the balance notes, and the
 *    full stop after the wordmark — the same period the favicon spends it
 *    on. The news never gets color; only the parts the paper is
 *    accountable for do. Since generation 3 the side spectrum is
 *    monochrome too — present positions filled, absent ones hollow.
 * 3. MINIMAL BY STRUCTURE. No cards, no shadows, no navigation beyond a
 *    link or two. Hairline dividers, small-caps labels between thin
 *    rules to mark a desk, a 68ch measure, and every page ends with a
 *    line that says so.
 * 4. SOURCES ARE LINKS. The sources line is the proof of work
 *    (NORTH-STAR §1) — every outlet name links to the account that was
 *    actually read. A reader who cannot check is only being told.
 * 5. THE FRONT PAGE IS THE PAPER COMPRESSED (generation 3). The lead
 *    section in full, a rule, then every other desk as one row per item.
 *    Sections live one click deeper at a dated address. The archive is a
 *    calendar of mornings. No manifesto on the front page: whose paper it
 *    is lives on the about page, with the constitution linked.
 *
 * All interpolated content is HTML-escaped; the compositor writes prose,
 * never markup.
 */
import {
  CONSTITUTION_URL,
  PAPER_DESCRIPTION,
  PAPER_MOTTO,
  PAPER_MOTTO_INLINE,
  PAPER_NAME,
  SITE_HOST,
  SITE_URL
} from "./config.js"

import type { EditionCorrection, EditionStory, SourceLink } from "./edition.js"
export {
  resolveSourceLinks,
  splitDiffer,
  splitParagraphs,
  type SourceLink
} from "./edition.js"

/** The site's story shape IS the edition document's — one waist. */
export type HtmlStory = EditionStory
export type HtmlCorrection = EditionCorrection

export interface HtmlReport {
  readonly feedsLine: string
  readonly funnelLine: string
  readonly droppedLines: ReadonlyArray<string>
  readonly healthLines?: ReadonlyArray<string>
}

const esc = (s: string): string =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")

// -- The semantic anatomy ----------------------------------------------------
// Markup names structure; brief.css (the default theme) names appearance.
// The class vocabulary here is the skin contract: a paper restyles these
// names and never touches this file. Three voice classes are shared by
// design — prose (the news), instrument (the paper speaking), accent (the
// claret, spent only on the paper's own measurements).

export const SITE_DESCRIPTION = PAPER_DESCRIPTION

/** Shared head metadata: title, description, canonical, OpenGraph/Twitter
 * card, and the favicon set (Lora lowercase e, claret period). `root` is
 * the relative path back to the site root ("./" at the root, "../../"
 * two directories down) so pages nested under a date resolve the
 * stylesheet and icons. */
const headMeta = (opts: {
  readonly title: string
  readonly description: string
  readonly path: string
  readonly root?: string
}): string => {
  const root = opts.root ?? "./"
  return `<title>${esc(opts.title)}</title>
<meta name="description" content="${esc(opts.description)}">
<link rel="canonical" href="${SITE_URL}${opts.path}">
<meta property="og:site_name" content="${esc(PAPER_NAME)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(opts.title)}">
<meta property="og:description" content="${esc(opts.description)}">
<meta property="og:url" content="${SITE_URL}${opts.path}">
<meta property="og:image" content="${SITE_URL}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="alternate" type="application/rss+xml" title="${esc(PAPER_NAME)} — the morning edition" href="${SITE_URL}/feed.xml">
<link rel="icon" type="image/png" href="${root}favicon.png">
<link rel="apple-touch-icon" href="${root}apple-touch-icon.png">`
}

export const longDate = (runId: string): string =>
  new Date(`${runId}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  })

const sourceAnchor = (s: SourceLink): string =>
  s.href === null
    ? esc(s.name)
    : `<a href="${esc(s.href)}" target="_blank" rel="noopener" class="story__source-link link">${esc(s.name)}</a>`

export const storyAnchor = (index: number): string => `s${index}`

const storySection = (story: HtmlStory, index: number): string => {
  const byline =
    story.byline === undefined || story.byline === null
      ? ""
      : `\n        <p class="story__byline instrument instrument--quiet">By ${esc(story.byline)}</p>`

  const body = story.bodyParagraphs
    .map((p) => `        <p class="story__body prose">${esc(p)}</p>`)
    .join("\n")

  const data =
    (story.data ?? []).length === 0
      ? ""
      : `\n        <ul role="list" class="story__data">\n${(story.data ?? [])
          .map(
            (d) =>
              `          <li class="story__data-row"><span class="story__data-label instrument instrument--quiet">${esc(d.label)}</span> <span class="story__data-value instrument">${esc(d.value)}</span>${d.note !== null ? `<span class="story__data-note instrument instrument--quiet"> ${esc(d.note)}</span>` : ""}</li>`
          )
          .join("\n")}\n        </ul>`

  const links =
    (story.links ?? []).length === 0
      ? ""
      : `\n        <ul role="list" class="story__links">\n${(story.links ?? [])
          .map(
            (l) =>
              `          <li class="story__links-item prose"><a href="${esc(l.href)}" class="link">${esc(l.title)}</a>${l.note !== null ? `<span class="story__link-note instrument instrument--quiet"> — ${esc(l.note)}</span>` : ""}</li>`
          )
          .join("\n")}\n        </ul>`

  const hasDiffer = story.differBullets.length > 0 || story.differParagraphs.length > 0
  const differ = !hasDiffer
    ? ""
    : story.differBullets.length > 0
      ? `\n        <h3 class="story__differ-label instrument instrument--label instrument--strong accent">Where the accounts differ</h3>
        <ul role="list" class="story__differ story__differ--list">\n${story.differBullets
          .map((b) => `          <li class="story__differ-item prose">${esc(b)}</li>`)
          .join("\n")}\n        </ul>`
      : `\n        <h3 class="story__differ-label instrument instrument--label instrument--strong accent">Where the accounts differ</h3>\n${story.differParagraphs
          .map((p) => `        <p class="story__differ prose">${esc(p)}</p>`)
          .join("\n")}`

  const balance =
    story.balanceNote === null
      ? ""
      : `\n          <p class="story__balance instrument accent">${esc(story.balanceNote)}</p>`

  const sources =
    story.sources.length === 0
      ? ""
      : `\n          <p class="story__sources instrument instrument--quiet">Sources&ensp;${story.sources.map(sourceAnchor).join(" · ")}</p>`

  const footer =
    sources === "" && balance === ""
      ? ""
      : `\n        <footer class="story__footer">${sources}${balance}
        </footer>`

  return `      <article id="${storyAnchor(index)}" class="story">
        <h2 class="story__headline">${esc(story.headline)}</h2>${byline}
${body}${data}${links}${differ}${footer}
      </article>`
}

/** One section of the edition page, as the site groups it (generation 3).
 * A single-section edition passes none and renders as generation 2 did. */
export interface HtmlSection {
  readonly slug: string
  readonly name: string
  readonly stories: ReadonlyArray<HtmlStory>
}

/** The stories of one section: the mains, then the fold, story anchors
 * numbered from `first` in print order. */
const storiesBlock = (
  stories: ReadonlyArray<HtmlStory>,
  first: number
): { html: string; next: number } => {
  const mains = stories.filter((s) => s.foldReason === null)
  const folds = stories.filter((s) => s.foldReason !== null)
  const mainsHtml = mains.map((s, i) => storySection(s, first + i)).join("\n\n")
  const foldsHtml = folds
    .map(
      (s, i) => `
    <section class="fold">
      <h2 class="fold__label instrument instrument--label instrument--strong accent">Below the fold</h2>
      <p class="fold__note instrument instrument--quiet">One nomination from outside the front page. The model's printed reason — judge it:</p>
      <p class="fold__reason instrument instrument--quiet">${esc(s.foldReason!)}</p>
${storySection(s, first + mains.length + i)}
    </section>`
    )
    .join("\n")
  return {
    html: `    <div class="edition__stories">
${mainsHtml}
    </div>
${foldsHtml}`,
    next: first + stories.length
  }
}

/** The body of the edition page: the stories, or — on a sectioned paper —
 * each desk labeled, its stories under it, and a line where it ends. */
const editionBody = (opts: {
  readonly stories: ReadonlyArray<HtmlStory>
  readonly sections?: ReadonlyArray<HtmlSection> | undefined
}): string => {
  const sections = opts.sections ?? []
  if (sections.length <= 1) return storiesBlock(opts.stories, 1).html
  const parts: Array<string> = []
  let next = 1
  for (const section of sections) {
    const block = storiesBlock(section.stories, next)
    next = block.next
    parts.push(`    <section class="desk" id="${esc(section.slug)}">
      <h2 class="desk__label section-label instrument instrument--label instrument--strong">${esc(section.name)}</h2>
${block.html}
      <p class="desk__end instrument instrument--quiet">${esc(section.name)} ends here.</p>
    </section>`)
  }
  return parts.join("\n")
}

/** The spectrum strip, monochrome (generation 3): all five known positions
 * in order, each filled when a side is present and hollow when absent, so
 * the shape of a story's coverage reads at a glance without the accent
 * being spent on it. Custom side labels follow as filled marks. */
const SIDE_BADGES: ReadonlyArray<{ side: string; abbr: string }> = [
  { side: "left", abbr: "L" },
  { side: "lean-left", abbr: "CL" },
  { side: "center", abbr: "C" },
  { side: "lean-right", abbr: "CR" },
  { side: "right", abbr: "R" }
]

export const sideSpectrum = (sides: ReadonlyArray<string>): string => {
  const known = SIDE_BADGES.map((b) => {
    const on = sides.includes(b.side)
    return `<span class="spectrum__side spectrum__side--${on ? "on" : "off"} side--${b.side}" title="${esc(b.side)}${on ? "" : " (not covered)"}">${b.abbr}</span>`
  })
  const custom = sides
    .filter((s) => !SIDE_BADGES.some((b) => b.side === s))
    .map((s) => `<span class="spectrum__side spectrum__side--on">${esc(s.slice(0, 2).toUpperCase())}</span>`)
  return [...known, ...custom].join(`<span class="spectrum__sep"> / </span>`)
}

// -- The archive calendar -----------------------------------------------------

export interface CalendarEdition {
  readonly runId: string
  /** The lead headline of the morning, when it printed one. */
  readonly lead: string | null
  /** How many desks printed that morning. */
  readonly sections: number
}

const monthLabel = (runId: string): string =>
  new Date(`${runId}T12:00:00`).toLocaleDateString("en-US", { year: "numeric", month: "long" })

/** "Sat 26" — assembled by hand, because ICU's day-and-weekday pattern
 * puts the number first. */
const dayLabel = (runId: string): string => {
  const d = new Date(`${runId}T12:00:00`)
  return `${d.toLocaleDateString("en-US", { weekday: "short" })} ${d.getDate()}`
}

/** The archive as a calendar of mornings: month by month, newest first,
 * each day its lead headline and how many desks printed. Every day is a
 * link to a fixed edition. */
export const renderCalendar = (
  editions: ReadonlyArray<CalendarEdition>,
  opts: { readonly root?: string } = {}
): string => {
  const root = opts.root ?? "./"
  const months = new Map<string, Array<CalendarEdition>>()
  for (const e of [...editions].sort((a, b) => (a.runId < b.runId ? 1 : -1))) {
    const key = e.runId.slice(0, 7)
    months.set(key, [...(months.get(key) ?? []), e])
  }
  const sectioned = editions.some((e) => e.sections > 1)
  return [...months.entries()]
    .map(
      ([, days]) => `      <section class="calendar__month">
        <h3 class="calendar__month-label instrument instrument--label instrument--strong">${esc(monthLabel(days[0]!.runId))}</h3>
        <ol role="list" class="calendar__days">
${days
          .map(
            (d) =>
              `          <li class="calendar__day"><a href="${root}${esc(d.runId)}.html" class="calendar__date instrument link">${esc(dayLabel(d.runId))}</a>${d.lead === null ? "" : `<span class="calendar__lead prose"> ${esc(d.lead)}</span>`}${sectioned ? `<span class="calendar__count instrument instrument--quiet"> ${d.sections} desk${d.sections === 1 ? "" : "s"}</span>` : ""}</li>`
          )
          .join("\n")}
        </ol>
      </section>`
    )
    .join("\n")
}

// -- The front page -----------------------------------------------------------

/** The front page: the nameplate with its date line and ears, the lead
 * section in full, the index of every other desk, the subscribe form, the
 * calendar of past editions, the feeds. It ends. */
export const renderHomePage = (opts: {
  readonly runId: string
  /** The lead section's stories, in full. */
  readonly lead: ReadonlyArray<HtmlStory>
  /** The line under the lead: "The brief ends here." on a single-section
   * paper, "<Name> ends here." on a sectioned one. */
  readonly leadEnd: string
  /** The other desks' counts for the ear: "Business 4 · Sports 3". Empty
   * on a single-section paper. */
  readonly counts: string
  /** The index of the other desks, rendered (index-dialect.ts); empty or
   * absent on a single-section paper. */
  readonly index?: string
  readonly corrections?: ReadonlyArray<HtmlCorrection>
  readonly calendar: ReadonlyArray<CalendarEdition>
  /** Per-desk feeds beside the paper's, on a sectioned paper. */
  readonly feeds?: ReadonlyArray<{ readonly name: string; readonly path: string }>
}): string => {
  const date = longDate(opts.runId)
  const corrections = opts.corrections ?? []
  const correctionsSection =
    corrections.length === 0
      ? ""
      : `
    <section class="corrections">
      <h2 class="corrections__label instrument instrument--label instrument--strong accent">Corrections</h2>
${corrections
          .map(
            (c) => `      <p class="corrections__item prose">In the edition of <a href="./${esc(c.edition)}.html" class="link">${esc(longDate(c.edition))}</a>, the story &ldquo;${esc(c.headline)}&rdquo;: ${esc(c.note)} The original stands unchanged in the archive.</p>`
          )
          .join("\n")}
    </section>`
  const index = opts.index !== undefined && opts.index !== "" ? `\n${opts.index}\n` : ""
  const feeds = [
    `<a href="./feed.xml" class="link">the paper</a>`,
    ...(opts.feeds ?? []).map((f) => `<a href="${esc(f.path)}" class="link">${esc(f.name)}</a>`)
  ].join(" · ")

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${headMeta({
    title: `${PAPER_NAME} — ${PAPER_MOTTO_INLINE}`,
    description: SITE_DESCRIPTION,
    path: "/"
  })}
<link rel="stylesheet" href="./brief.css">
</head>
<body class="page">
<main class="page__main">
  <div class="page__measure">

    <nav class="page__nav page__nav--between">
      <a href="./${esc(opts.runId)}.html" class="page__nav-link instrument instrument--quiet link">Today's paper, whole</a>
      <a href="./sources.html" class="page__nav-link instrument instrument--quiet link">About this paper</a>
    </nav>

    <header class="masthead masthead--front">
      <h1 class="masthead__wordmark">${esc(PAPER_NAME)}<span class="masthead__stop accent">.</span></h1>
      <p class="masthead__date instrument instrument--label">${esc(date)}</p>
      <div class="masthead__ears instrument instrument--quiet">
        <p class="masthead__ear masthead__ear--motto">${esc(PAPER_MOTTO)}</p>${
          opts.counts === ""
            ? ""
            : `
        <p class="masthead__ear masthead__ear--counts">${esc(opts.counts)}</p>`
        }
      </div>
    </header>
${correctionsSection}
    <section class="lead">
${storiesBlock(opts.lead, 1).html}
      <p class="lead__end instrument instrument--quiet">${esc(opts.leadEnd)}</p>
    </section>
${index}
    <section class="page-section page-section--tight">
      <h2 class="section-label instrument instrument--label instrument--strong">The morning edition, by email</h2>
      <form method="POST" action="/subscribe" class="subscribe">
        <div class="honeypot" aria-hidden="true"><input type="text" name="website" tabindex="-1" autocomplete="off"></div>
        <label for="sub-email" class="visually-hidden">Email address</label>
        <input id="sub-email" type="email" name="email" required placeholder="you@example.com" class="subscribe__input instrument">
        <button type="submit" class="subscribe__button instrument">Subscribe</button>
      </form>
      <p class="instrument instrument--quiet">One email each day. It ends. Unsubscribe in every footer.</p>
    </section>

    <section class="calendar">
      <h2 class="section-label instrument instrument--label instrument--strong">Past editions</h2>
${renderCalendar(opts.calendar)}
    </section>

    <footer class="page__footer">
      <p class="feeds instrument instrument--quiet">RSS — ${feeds}. One item per edition, for your own reader.</p>
      <p class="page__end">That is the paper for today.</p>
    </footer>

  </div>
</main>
</body>
</html>
`
}

// -- A section page -----------------------------------------------------------

/** One desk at its dated address: /YYYY-MM-DD/<slug>/. The section's
 * stories in full, where it sits in the paper, and its neighbours. Story
 * anchors keep their paper-global numbers, so a link to #s7 means the
 * same story here and on the whole-paper page. */
export const renderSectionPage = (opts: {
  readonly runId: string
  readonly section: HtmlSection
  /** The paper-global position of this section's first story. */
  readonly first: number
  /** 1-based, of `total`. */
  readonly position: number
  readonly total: number
  readonly prev: { readonly slug: string; readonly name: string } | null
  readonly next: { readonly slug: string; readonly name: string } | null
}): string => {
  const date = longDate(opts.runId)
  const root = "../../"
  const neighbour = (n: { slug: string; name: string } | null, rel: "prev" | "next"): string =>
    n === null
      ? `<span class="section-nav__link section-nav__link--none instrument instrument--quiet"></span>`
      : `<a href="../${esc(n.slug)}/" rel="${rel}" class="section-nav__link instrument instrument--quiet link">${rel === "prev" ? "← " : ""}${esc(n.name)}${rel === "next" ? " →" : ""}</a>`
  const nav = `    <nav class="section-nav">
      ${neighbour(opts.prev, "prev")}
      <span class="section-nav__position instrument instrument--label instrument--quiet">Section ${opts.position} of ${opts.total}</span>
      ${neighbour(opts.next, "next")}
    </nav>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${headMeta({
    title: `${PAPER_NAME} — ${opts.section.name} — ${date}`,
    description: `${opts.section.name}, the ${date} edition of ${PAPER_NAME}: ${opts.section.stories.length} item${opts.section.stories.length === 1 ? "" : "s"}, every source linked.`,
    path: `/${opts.runId}/${opts.section.slug}/`,
    root
  })}
<link rel="stylesheet" href="${root}brief.css">
</head>
<body class="page">
<main class="page__main">
  <div class="page__measure">

    <nav class="page__nav page__nav--between">
      <a href="${root}index.html" class="page__nav-link instrument instrument--quiet link">${esc(SITE_HOST)}</a>
      <a href="${root}${esc(opts.runId)}.html#${esc(opts.section.slug)}" class="page__nav-link instrument instrument--quiet link">This morning's paper, whole</a>
    </nav>

    <header class="masthead">
      <h1 class="masthead__wordmark">${esc(PAPER_NAME)}<span class="masthead__stop accent">.</span></h1>
      <p class="masthead__page-title instrument instrument--label">${esc(opts.section.name)}</p>
      <p class="masthead__date instrument instrument--label">${esc(date)}</p>
    </header>

${nav}

    <section class="desk" id="${esc(opts.section.slug)}">
${storiesBlock(opts.section.stories, opts.first).html}
      <p class="desk__end instrument instrument--quiet">${esc(opts.section.name)} ends here.</p>
    </section>

${nav}

    <footer class="page__footer">
      <p class="page__end page__end--tight">Every item above names where it came from. Follow the link.</p>
    </footer>

  </div>
</main>
</body>
</html>
`
}

// -- The about page (sources) -------------------------------------------------

/** The paper's claim about where its side labels came from — rendered
 * only when the masthead declares a [seed]. The press asserts nothing it
 * does not know. */
export interface SourcesSeed {
  readonly name: string
  readonly url?: string | undefined
  readonly version?: string | undefined
  readonly description?: string | undefined
}

/** The about page, at sources.html (the link readers have): whose paper
 * this is, its constitution when the paper names one, and the masthead
 * explained to a reader with the seed provenance linked when declared.
 * Sides render in spectrum order, monochrome. */
export const renderSourcesPage = (
  bySide: ReadonlyArray<{ side: string; outlets: ReadonlyArray<string> }>,
  seed: SourcesSeed | null = null,
  opts: { readonly constitutionUrl?: string | null } = {}
): string => {
  const constitutionUrl = opts.constitutionUrl ?? (CONSTITUTION_URL === "" ? null : CONSTITUTION_URL)
  const seedName =
    seed === null
      ? ""
      : seed.url === undefined
        ? esc(seed.name)
        : `<a href="${esc(seed.url)}" target="_blank" rel="noopener" class="link">${esc(seed.name)}</a>`
  const seedParagraph =
    seed === null
      ? ""
      : `
      <p class="prose">The side labels are seeded from the ${seedName}${seed.version === undefined ? "" : ` (${esc(seed.version)})`}${seed.description === undefined ? "" : `, ${esc(seed.description)}`}. ${esc(seed.name)} rates perspective, not accuracy — and so does this page. A label here is a map reference, not a verdict.</p>`
  const constitution =
    constitutionUrl === null
      ? ""
      : ` The standards it keeps are written down: <a href="${esc(constitutionUrl)}" target="_blank" rel="noopener" class="link">the constitution</a>.`

  const rows = bySide
    .map((g) => {
      const known = SIDE_BADGES.some((b) => b.side === g.side)
      const cls = known ? ` side--${g.side}` : " instrument--quiet"
      return `      <div class="side-row">
        <p class="side-row__label instrument instrument--label${cls}">${esc(g.side)}</p>
        <p class="side-row__outlets prose">${g.outlets.map(esc).join(" · ")}</p>
      </div>`
    })
    .join("\n")

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${headMeta({
    title: `${PAPER_NAME} — about this paper`,
    description:
      `Whose paper ${PAPER_NAME} is, and every outlet it reads and where it stands${seed === null ? "" : `, seeded from the ${seed.name}`}. The masthead is a file: change the file, change the paper.`,
    path: "/sources.html"
  })}
<link rel="stylesheet" href="./brief.css">
</head>
<body class="page">
<main class="page__main">
  <div class="page__measure">

    <nav class="page__nav">
      <a href="./index.html" class="page__nav-link instrument instrument--quiet link">Back to today's paper</a>
    </nav>

    <header class="masthead">
      <h1 class="masthead__wordmark">${esc(PAPER_NAME)}<span class="masthead__stop accent">.</span></h1>
      <p class="masthead__page-title instrument instrument--label">About this paper</p>
    </header>

    <div class="about">
      <p class="prose">${esc(PAPER_MOTTO)} ${esc(PAPER_NAME)} is a daily paper printed by its editor's own press, on their own machine, from source files they own. It has no account, no feed and no recommendations: each morning's edition ends, and the archive of past mornings is fixed.${constitution}</p>
      <p class="prose">Every story in the brief is one event told through the accounts of outlets that disagree. Which outlets, and where each one stands, is not decided by an algorithm and not decided story by story — it is a single file, owned by this paper's editor, and this page is that file made visible.</p>${seedParagraph}
      <p class="prose">When a story's coverage collapses onto one side of that map, the brief says so, in plain words, right under the story. That line is a measurement, and you are entitled to it.</p>
    </div>

    <div class="side-table">
${rows}
    </div>

    <footer class="page__footer">
      <p class="page__end page__end--tight">The masthead is a file. Change the file, change the paper.</p>
    </footer>

  </div>
</main>
</body>
</html>
`
}

// -- The whole paper, dated ---------------------------------------------------

export const renderEditionHtml = (opts: {
  readonly runId: string
  readonly editionLabel: string
  readonly stories: ReadonlyArray<HtmlStory>
  readonly report: HtmlReport
  readonly corrections?: ReadonlyArray<HtmlCorrection>
  /** The stories grouped by section, when the paper has more than one.
   * Must cover exactly `stories`, in the same order. */
  readonly sections?: ReadonlyArray<HtmlSection>
}): string => {
  const date = longDate(opts.runId)
  const corrections = opts.corrections ?? []
  const correctionsSection =
    corrections.length === 0
      ? ""
      : `
    <section class="corrections">
      <h2 class="corrections__label instrument instrument--label instrument--strong accent">Corrections</h2>
${corrections
          .map(
            (c) => `      <p class="corrections__item prose">In the edition of <a href="./${esc(c.edition)}.html" class="link">${esc(longDate(c.edition))}</a>, the story &ldquo;${esc(c.headline)}&rdquo;: ${esc(c.note)} The original stands unchanged in the archive.</p>`
          )
          .join("\n")}
    </section>`

  const dropped = [
    ...opts.report.droppedLines,
    ...(opts.report.healthLines ?? [])
  ]
    .map((d) => `        <p>${esc(d)}</p>`)
    .join("\n")

  const sectioned = (opts.sections ?? []).length > 1

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${headMeta({
    title: `${PAPER_NAME} — ${date}`,
    description: `The ${date} edition: ${opts.stories.length} stories, each one event told through outlets that disagree, every source linked.`,
    path: `/${opts.runId}.html`
  })}
<link rel="stylesheet" href="./brief.css">
</head>
<body class="page">
<main class="page__main">
  <div class="page__measure">

    <nav class="page__nav page__nav--between">
      <a href="./index.html" class="page__nav-link instrument instrument--quiet link">${esc(SITE_HOST)}</a>
      <a href="./sources.html" class="page__nav-link instrument instrument--quiet link">About this paper</a>
    </nav>

    <header class="masthead">
      <h1 class="masthead__wordmark">${esc(PAPER_NAME)}<span class="masthead__stop accent">.</span></h1>
      <p class="masthead__motto instrument">${esc(PAPER_MOTTO)}</p>
      <p class="masthead__date instrument instrument--label">${esc(date)}${opts.editionLabel ? ` · ${esc(opts.editionLabel)}` : ""}</p>
    </header>
${correctionsSection}
${editionBody(opts)}

    <footer class="report">
      <h2 class="report__label instrument instrument--label instrument--strong">The run, reported</h2>
      <div class="report__lines instrument instrument--quiet">
        <p>${esc(opts.report.feedsLine)}</p>
        <p>${esc(opts.report.funnelLine)}</p>
${dropped}
      </div>
      <p class="page__end">${sectioned ? "The paper ends here." : "The brief ends here."}</p>
    </footer>

  </div>
</main>
</body>
</html>
`
}
