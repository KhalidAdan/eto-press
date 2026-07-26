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
 *    eto's own measurements: the differ label and the balance notes. The
 *    news never gets color; only the parts eto is accountable for do.
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

export interface SourceLink {
  readonly name: string
  readonly href: string | null
}

export interface HtmlStory {
  readonly headline: string
  readonly bodyParagraphs: ReadonlyArray<string>
  readonly differBullets: ReadonlyArray<string>
  readonly differParagraphs: ReadonlyArray<string>
  readonly sources: ReadonlyArray<SourceLink>
  readonly balanceNote: string | null
  /** The stage-6b nomination reason; null on front-page stories. */
  readonly foldReason: string | null
}

export interface HtmlReport {
  readonly feedsLine: string
  readonly funnelLine: string
  readonly droppedLines: ReadonlyArray<string>
}

/** Split composed prose into paragraphs (blank-line separated, with
 * single-newline fallback). */
export const splitParagraphs = (text: string): Array<string> => {
  const byBlank = text.split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean)
  if (byBlank.length > 1) return byBlank
  return text.split(/\n/).map((t) => t.trim()).filter(Boolean)
}

/** The differ section arrives as either bullets or paragraphs. */
export const splitDiffer = (
  differ: string
): { bullets: Array<string>; paragraphs: Array<string> } => {
  const lines = differ.split(/\n/).map((l) => l.trim()).filter(Boolean)
  const bulletLines = lines.filter((l) => /^[*•-]\s+/.test(l))
  if (bulletLines.length > 0 && bulletLines.length >= lines.length / 2) {
    return {
      bullets: lines.map((l) => l.replace(/^[*•-]\s+/, "")),
      paragraphs: []
    }
  }
  return { bullets: [], paragraphs: splitParagraphs(differ) }
}

/** Map the sources line's outlet names to the account URLs actually read.
 * Names come from the compositor; links come from the journal — fuzzy
 * containment matching, same posture as the verifier. */
export const resolveSourceLinks = (
  sourcesLine: string,
  linkByOutlet: ReadonlyMap<string, string>
): Array<SourceLink> => {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim()
  return sourcesLine
    .split(/[-·,•|]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((name) => {
      for (const [outlet, href] of linkByOutlet) {
        if (norm(outlet).includes(norm(name)) || norm(name).includes(norm(outlet))) {
          return { name, href }
        }
      }
      return { name, href: null }
    })
}

const esc = (s: string): string =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")

// -- The type scale, named once ---------------------------------------------
const PROSE = "text-pretty text-lg/8 sm:text-base/7"
const MONO = "font-mono text-base/7 sm:text-sm/6"
const MONO_QUIET = `${MONO} text-neutral-950/70 dark:text-white/60`
const ACCENT = "text-red-900 dark:text-red-300/90"
const HAIRLINE = "border-neutral-950/15 dark:border-white/15"

const sourceAnchor = (s: SourceLink): string =>
  s.href === null
    ? esc(s.name)
    : `<a href="${esc(s.href)}" target="_blank" rel="noopener" class="underline decoration-neutral-950/25 underline-offset-4 hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 dark:decoration-white/25">${esc(s.name)}</a>`

const storySection = (story: HtmlStory): string => {
  const body = story.bodyParagraphs
    .map((p) => `        <p class="${PROSE}">${esc(p)}</p>`)
    .join("\n")

  const differ =
    story.differBullets.length > 0
      ? `        <ul role="list" class="flex flex-col gap-3">\n${story.differBullets
          .map((b) => `          <li class="${PROSE}">${esc(b)}</li>`)
          .join("\n")}\n        </ul>`
      : story.differParagraphs
          .map((p) => `        <p class="${PROSE}">${esc(p)}</p>`)
          .join("\n")

  const balance =
    story.balanceNote === null
      ? ""
      : `\n          <p class="${MONO} ${ACCENT}">${esc(story.balanceNote)}</p>`

  return `      <article class="flex flex-col gap-5 py-12">
        <h2 class="text-pretty text-2xl font-semibold tracking-tight sm:text-3xl">${esc(story.headline)}</h2>
${body}
        <h3 class="${MONO} font-medium uppercase tracking-wide ${ACCENT}">Where the accounts differ</h3>
${differ}
        <footer class="flex flex-col gap-2 pt-1">
          <p class="${MONO_QUIET}">Sources&ensp;${story.sources.map(sourceAnchor).join(" · ")}</p>${balance}
        </footer>
      </article>`
}

/** The "How we choose our sources" page — the masthead explained to a
 * reader, with the AllSides provenance linked (NORTH-STAR, The Default
 * Masthead). Sides render in spectrum order. */
export const renderSourcesPage = (
  bySide: ReadonlyArray<{ side: string; outlets: ReadonlyArray<string> }>
): string => {
  const rows = bySide
    .map(
      (g) => `      <div class="flex flex-col gap-2 py-6 sm:flex-row sm:gap-6">
        <p class="${MONO} w-32 shrink-0 uppercase tracking-wide ${ACCENT}">${esc(g.side)}</p>
        <p class="${PROSE}">${g.outlets.map(esc).join(" · ")}</p>
      </div>`
    )
    .join("\n")

  return `<!DOCTYPE html>
<html lang="en" class="antialiased">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>eto — How we choose our sources</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400..700;1,400..700&family=IBM+Plex+Mono:ital,wght@0,400;0,500;1,400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="./brief.css">
</head>
<body class="bg-white font-serif text-neutral-950 dark:bg-neutral-950 dark:text-neutral-100">
<main class="isolate px-6 py-10 sm:py-14">
  <div class="mx-auto max-w-[68ch]">

    <nav class="flex justify-end pb-6">
      <a href="./index.html" class="${MONO_QUIET} underline decoration-neutral-950/25 underline-offset-4 hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 dark:decoration-white/25">Back to today's brief</a>
    </nav>

    <header class="flex flex-col items-center gap-4 border-b ${HAIRLINE} pb-10 text-center">
      <h1 class="text-6xl font-medium tracking-tight">eto</h1>
      <p class="${MONO} uppercase tracking-wide">How we choose our sources</p>
    </header>

    <div class="flex flex-col gap-5 py-12">
      <p class="${PROSE}">Every story in this paper is one event told through the accounts of outlets that disagree. Which outlets, and where each one stands, is not decided by an algorithm and not decided story by story — it is a single file, owned by this paper's editor, and this page is that file made visible.</p>
      <p class="${PROSE}">The side labels are seeded from the <a href="https://www.allsides.com/media-bias/media-bias-chart" target="_blank" rel="noopener" class="underline decoration-neutral-950/25 underline-offset-4 hover:decoration-current dark:decoration-white/25">AllSides Media Bias Chart</a> (v11.3), which rates outlets from left to right by balancing the judgment of readers and reviewers across the political spectrum. AllSides rates perspective, not accuracy — and so does this page. A label here is a map reference, not a verdict.</p>
      <p class="${PROSE}">When a story's coverage collapses onto one side of that map, the brief says so, in plain words, right under the story. That line is a measurement, and you are entitled to it.</p>
    </div>

    <div class="flex flex-col divide-y divide-neutral-950/10 border-t ${HAIRLINE} dark:divide-white/10">
${rows}
    </div>

    <footer class="flex flex-col gap-4 border-t ${HAIRLINE} pt-10">
      <p class="pt-2 text-center text-lg/8 sm:text-base/7 italic text-neutral-950/60 dark:text-white/55">The masthead is a file. Change the file, change the paper.</p>
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
}): string => {
  const longDate = new Date(`${opts.runId}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  })

  const dropped = opts.report.droppedLines
    .map((d) => `        <p>${esc(d)}</p>`)
    .join("\n")

  return `<!DOCTYPE html>
<html lang="en" class="antialiased">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>eto — ${esc(longDate)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400..700;1,400..700&family=IBM+Plex+Mono:ital,wght@0,400;0,500;1,400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="./brief.css">
</head>
<body class="bg-white font-serif text-neutral-950 dark:bg-neutral-950 dark:text-neutral-100">
<main class="isolate px-6 py-10 sm:py-14">
  <div class="mx-auto max-w-[68ch]">

    <nav class="flex justify-end pb-6">
      <a href="./sources.html" class="${MONO_QUIET} underline decoration-neutral-950/25 underline-offset-4 hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 dark:decoration-white/25">How we choose our sources</a>
    </nav>

    <header class="flex flex-col items-center gap-4 border-b ${HAIRLINE} pb-10 text-center">
      <h1 class="text-6xl font-medium tracking-tight">eto</h1>
      <p class="${MONO} text-neutral-950/60 dark:text-white/55">One story. Every side. Then it ends.</p>
      <p class="${MONO} uppercase tracking-wide">${esc(longDate)}${opts.editionLabel ? ` · ${esc(opts.editionLabel)}` : ""}</p>
    </header>

    <div class="flex flex-col divide-y divide-neutral-950/10 dark:divide-white/10">
${opts.stories.filter((s) => s.foldReason === null).map(storySection).join("\n\n")}
    </div>
${opts.stories
    .filter((s) => s.foldReason !== null)
    .map(
      (s) => `
    <section class="flex flex-col gap-3 border-t ${HAIRLINE} pt-10">
      <h2 class="${MONO} font-medium uppercase tracking-wide ${ACCENT}">Below the fold</h2>
      <p class="${MONO_QUIET}">One nomination from outside the front page. The model's printed reason — judge it:</p>
      <p class="${MONO_QUIET} italic">${esc(s.foldReason!)}</p>
${storySection(s)}
    </section>`
    )
    .join("\n")}

    <footer class="flex flex-col gap-4 border-t ${HAIRLINE} pt-10">
      <h2 class="${MONO} font-medium uppercase tracking-wide">The run, reported</h2>
      <div class="flex flex-col gap-2 ${MONO_QUIET} tabular-nums">
        <p>${esc(opts.report.feedsLine)}</p>
        <p>${esc(opts.report.funnelLine)}</p>
${dropped}
      </div>
      <p class="pt-6 text-center text-lg/8 sm:text-base/7 italic text-neutral-950/60 dark:text-white/55">The brief ends here.</p>
    </footer>

  </div>
</main>
</body>
</html>
`
}
