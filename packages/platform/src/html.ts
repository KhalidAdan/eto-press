/**
 * The edition template — eto's visual dogma, encoded.
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
 *    accountable for do.
 * 3. MINIMAL BY STRUCTURE. No cards, no shadows, no navigation. Hairline
 *    opacity dividers, a 68ch measure, and after "The brief ends here."
 *    there is nothing to scroll to.
 * 4. SOURCES ARE LINKS. The sources line is the proof of work
 *    (NORTH-STAR paragraph 3) — every outlet name links to the account
 *    that was actually read. A reader who cannot check is only being
 *    told.
 *
 * All interpolated content is HTML-escaped; the compositor writes prose,
 * never markup.
 */
import {
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
 * card, and the favicon set (Lora lowercase e, claret period). */
const headMeta = (opts: {
  readonly title: string
  readonly description: string
  readonly path: string
}): string => `<title>${esc(opts.title)}</title>
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
<link rel="icon" type="image/png" href="./favicon.png">
<link rel="apple-touch-icon" href="./apple-touch-icon.png">`

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
  const body = story.bodyParagraphs
    .map((p) => `        <p class="story__body prose">${esc(p)}</p>`)
    .join("\n")

  const differ =
    story.differBullets.length > 0
      ? `        <ul role="list" class="story__differ story__differ--list">\n${story.differBullets
          .map((b) => `          <li class="story__differ-item prose">${esc(b)}</li>`)
          .join("\n")}\n        </ul>`
      : story.differParagraphs
          .map((p) => `        <p class="story__differ prose">${esc(p)}</p>`)
          .join("\n")

  const balance =
    story.balanceNote === null
      ? ""
      : `\n          <p class="story__balance instrument accent">${esc(story.balanceNote)}</p>`

  return `      <article id="${storyAnchor(index)}" class="story">
        <h2 class="story__headline">${esc(story.headline)}</h2>
${body}
        <h3 class="story__differ-label instrument instrument--label instrument--strong accent">Where the accounts differ</h3>
${differ}
        <footer class="story__footer">
          <p class="story__sources instrument instrument--quiet">Sources&ensp;${story.sources.map(sourceAnchor).join(" · ")}</p>${balance}
        </footer>
      </article>`
}

/** The home page at eto.news: the North Star stated briefly for readers,
 * today's stories, past editions, and the sources page. It ends too. */
export interface HomeCard {
  readonly title: string
  readonly anchor: string
  readonly fold: boolean
  /** e.g. "6 outlets" — the breadth measurement. */
  readonly outletsLabel: string
  /** Masthead side labels present on this story, any order. */
  readonly sides: ReadonlyArray<string>
  /** The outlet-designated link-preview image, hotlinked with credit —
   * null renders a typographic card. */
  readonly image: { readonly src: string; readonly credit: string } | null
}

/** The spectrum strip: side labels abbreviated and colored blue-to-red
 * (center is purple), separators dimmed so the letters carry the line.
 * The five known sides get side--{label} classes; the theme colors them. */
const SIDE_BADGES: ReadonlyArray<{ side: string; abbr: string }> = [
  { side: "left", abbr: "L" },
  { side: "lean-left", abbr: "CL" },
  { side: "center", abbr: "C" },
  { side: "lean-right", abbr: "CR" },
  { side: "right", abbr: "R" }
]

export const sideSpectrum = (sides: ReadonlyArray<string>): string => {
  const known = SIDE_BADGES.filter((b) => sides.includes(b.side)).map(
    (b) => `<span class="spectrum__side side--${b.side}">${b.abbr}</span>`
  )
  const custom = sides
    .filter((s) => !SIDE_BADGES.some((b) => b.side === s))
    .map((s) => `<span class="spectrum__side">${esc(s.slice(0, 2).toUpperCase())}</span>`)
  return [...known, ...custom].join(`<span class="spectrum__sep"> / </span>`)
}

export const renderHomePage = (opts: {
  readonly latestRunId: string
  readonly headlines: ReadonlyArray<HomeCard>
  readonly editions: ReadonlyArray<string>
}): string => {
  const latest = `./${opts.latestRunId}.html`
  const card = (h: HomeCard): string => {
    const image =
      h.image === null
        ? ""
        : `\n          <figure class="card__figure">
            <img src="${esc(h.image.src)}" alt="" loading="lazy" referrerpolicy="no-referrer" class="card__image">
            <figcaption class="card__credit instrument">image · ${esc(h.image.credit)}</figcaption>
          </figure>`
    return `        <li class="card">
          <a href="${latest}#${h.anchor}" class="card__link group">${image}
            <div class="card__body">
              ${h.fold ? `<p class="card__fold-tag instrument instrument--label accent">Below the fold</p>
              ` : ""}<h3 class="card__title">${esc(h.title)}</h3>
              <p class="card__meta instrument">${esc(h.outletsLabel)}<span class="card__meta-sep"> · </span>${sideSpectrum(h.sides)}</p>
            </div>
          </a>
        </li>`
  }
  const headlineList = opts.headlines.map(card).join("\n")

  const editionList = opts.editions
    .map((e) => `<a href="./${e}.html" class="link">${esc(longDate(e))}</a>`)
    .join(" · ")

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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400..700;1,400..700&family=IBM+Plex+Mono:ital,wght@0,400;0,500;1,400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="./brief.css">
</head>
<body class="page">
<main class="page__main">
  <div class="page__measure">

    <nav class="page__nav">
      <a href="./sources.html" class="page__nav-link instrument instrument--quiet link">How we choose our sources</a>
    </nav>

    <header class="masthead">
      <h1 class="masthead__wordmark">${esc(PAPER_NAME)}<span class="masthead__stop accent">.</span></h1>
      <p class="masthead__motto instrument">${esc(PAPER_MOTTO)}</p>
    </header>

    <div class="about">
      <p class="prose">${esc(PAPER_NAME)} takes a single event, gathers the accounts of it published by outlets that disagree, and writes one piece of prose that holds all of them. It names every source it used. Then it stops.</p>
      <p class="prose">Where the accounts conflict, the story says so — in the body, in plain words, with each side named. Consensus manufactured by deleting the contradiction is not neutrality; it is a quieter kind of lying. And when only one side of the aisle covered a story, the brief tells you that too, because a measurement you are entitled to should never be quietly corrected.</p>
      <p class="prose">There is no feed here. No recommendations, no related stories, nothing trained on what kept you reading. The brief ends today the way it ended yesterday, and you leave.</p>
    </div>

    <section class="page-section">
      <h2 class="section-label instrument instrument--label instrument--strong">Today — ${esc(longDate(opts.latestRunId))}</h2>
      <ul role="list" class="cards">
${headlineList}
      </ul>
    </section>

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

    <footer class="page__footer">
      <h2 class="section-label instrument instrument--label instrument--strong">Past editions</h2>
      <p class="instrument instrument--quiet">${editionList}</p>
      <p class="instrument instrument--quiet"><a href="/feed.xml" class="link">RSS</a> — one item per edition, the whole brief inside, for your own reader.</p>
      <p class="page__end">A newspaper whose sources you can read — in both senses.</p>
    </footer>

  </div>
</main>
</body>
</html>
`
}

/** The paper's claim about where its side labels came from — rendered
 * only when the masthead declares a [seed]. The press asserts nothing it
 * does not know. */
export interface SourcesSeed {
  readonly name: string
  readonly url?: string | undefined
  readonly version?: string | undefined
  readonly description?: string | undefined
}

/** The "How we choose our sources" page — the masthead explained to a
 * reader, with the seed provenance linked when the masthead declares one
 * (NORTH-STAR, The Default Masthead). Sides render in spectrum order. */
export const renderSourcesPage = (
  bySide: ReadonlyArray<{ side: string; outlets: ReadonlyArray<string> }>,
  seed: SourcesSeed | null = null
): string => {
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
    title: `${PAPER_NAME} — how we choose our sources`,
    description:
      `Every outlet this paper reads and where it stands${seed === null ? "" : `, seeded from the ${seed.name}`}. The masthead is a file: change the file, change the paper.`,
    path: "/sources.html"
  })}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400..700;1,400..700&family=IBM+Plex+Mono:ital,wght@0,400;0,500;1,400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="./brief.css">
</head>
<body class="page">
<main class="page__main">
  <div class="page__measure">

    <nav class="page__nav">
      <a href="./index.html" class="page__nav-link instrument instrument--quiet link">Back to today's brief</a>
    </nav>

    <header class="masthead">
      <h1 class="masthead__wordmark">${esc(PAPER_NAME)}<span class="masthead__stop accent">.</span></h1>
      <p class="masthead__page-title instrument instrument--label">How we choose our sources</p>
    </header>

    <div class="about">
      <p class="prose">Every story in this paper is one event told through the accounts of outlets that disagree. Which outlets, and where each one stands, is not decided by an algorithm and not decided story by story — it is a single file, owned by this paper's editor, and this page is that file made visible.</p>${seedParagraph}
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

export const renderEditionHtml = (opts: {
  readonly runId: string
  readonly editionLabel: string
  readonly stories: ReadonlyArray<HtmlStory>
  readonly report: HtmlReport
  readonly corrections?: ReadonlyArray<HtmlCorrection>
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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400..700;1,400..700&family=IBM+Plex+Mono:ital,wght@0,400;0,500;1,400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="./brief.css">
</head>
<body class="page">
<main class="page__main">
  <div class="page__measure">

    <nav class="page__nav page__nav--between">
      <a href="./index.html" class="page__nav-link instrument instrument--quiet link">${esc(SITE_HOST)}</a>
      <a href="./sources.html" class="page__nav-link instrument instrument--quiet link">How we choose our sources</a>
    </nav>

    <header class="masthead">
      <h1 class="masthead__wordmark">${esc(PAPER_NAME)}<span class="masthead__stop accent">.</span></h1>
      <p class="masthead__motto instrument">${esc(PAPER_MOTTO)}</p>
      <p class="masthead__date instrument instrument--label">${esc(date)}${opts.editionLabel ? ` · ${esc(opts.editionLabel)}` : ""}</p>
    </header>
${correctionsSection}
    <div class="edition__stories">
${opts.stories
    .filter((s) => s.foldReason === null)
    .map((s, i) => storySection(s, i + 1))
    .join("\n\n")}
    </div>
${opts.stories
    .filter((s) => s.foldReason !== null)
    .map(
      (s, i) => `
    <section class="fold">
      <h2 class="fold__label instrument instrument--label instrument--strong accent">Below the fold</h2>
      <p class="fold__note instrument instrument--quiet">One nomination from outside the front page. The model's printed reason — judge it:</p>
      <p class="fold__reason instrument instrument--quiet">${esc(s.foldReason!)}</p>
${storySection(s, opts.stories.filter((x) => x.foldReason === null).length + i + 1)}
    </section>`
    )
    .join("\n")}

    <footer class="report">
      <h2 class="report__label instrument instrument--label instrument--strong">The run, reported</h2>
      <div class="report__lines instrument instrument--quiet">
        <p>${esc(opts.report.feedsLine)}</p>
        <p>${esc(opts.report.funnelLine)}</p>
${dropped}
      </div>
      <p class="page__end">The brief ends here.</p>
    </footer>

  </div>
</main>
</body>
</html>
`
}
