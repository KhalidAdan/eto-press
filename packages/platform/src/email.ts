/**
 * The email edition — the dogma's inbox dialect. Same structure as the
 * paper (masthead, stories, differ, linked sources, balance notes, an
 * end), but inline styles throughout and Georgia standing in for Lora,
 * because email clients strip stylesheets and ignore webfonts.
 *
 * No tracking pixels, no click wrapping — §7 extends to inboxes. The only
 * link the reader didn't ask for is the unsubscribe link, and that one is
 * a courtesy: SES substitutes {{amazonSESUnsubscribeUrl}} per recipient.
 */
import { ACCENT, PAPER_MOTTO, PAPER_NAME, SITE_HOST, SITE_URL } from "./config.js"
import type { EditionCorrection } from "./edition.js"
import { longDate, type HtmlStory } from "./html.js"

const INK = "#0a0a0a"
const CLARET = ACCENT
const QUIET = "#6b6b6b"
const HAIRLINE = "#e4e4e4"

const SERIF = "Georgia, 'Times New Roman', serif"
const MONO = "Consolas, Menlo, 'Courier New', monospace"

const esc = (s: string): string =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")

const para = (text: string): string =>
  `<p style="margin:0 0 14px 0;font-family:${SERIF};font-size:16px;line-height:1.65;color:${INK};">${esc(text)}</p>`

const monoLine = (html: string, color = QUIET): string =>
  `<p style="margin:0 0 10px 0;font-family:${MONO};font-size:13px;line-height:1.6;color:${color};">${html}</p>`

const storyBlock = (s: HtmlStory): string => {
  const differ =
    s.differBullets.length > 0
      ? s.differBullets
          .map(
            (b) =>
              `<p style="margin:0 0 10px 0;padding-left:14px;font-family:${SERIF};font-size:16px;line-height:1.65;color:${INK};">– ${esc(b)}</p>`
          )
          .join("")
      : s.differParagraphs.map(para).join("")

  const sources = s.sources
    .map((src) =>
      src.href === null
        ? esc(src.name)
        : `<a href="${esc(src.href)}" style="color:${INK};">${esc(src.name)}</a>`
    )
    .join(" · ")

  const fold =
    s.foldReason === null
      ? ""
      : monoLine(
          `<span style="color:${CLARET};text-transform:uppercase;letter-spacing:1px;">Below the fold</span> — the model's one nomination, reason printed: <em>${esc(s.foldReason)}</em>`
        )

  const balance =
    s.balanceNote === null ? "" : monoLine(esc(s.balanceNote), CLARET)

  const byline =
    s.byline === undefined || s.byline === null
      ? ""
      : `${monoLine(`By ${esc(s.byline)}`)}
    `
  const dataList =
    (s.data ?? []).length === 0
      ? ""
      : `${(s.data ?? [])
          .map(
            (d) =>
              `<p style="margin:0 0 8px 0;font-family:${MONO};font-size:13px;line-height:1.6;color:${INK};"><span style="color:${QUIET};">${esc(d.label)}</span> ${esc(d.value)}${d.note !== null ? `<span style="color:${QUIET};"> ${esc(d.note)}</span>` : ""}</p>`
          )
          .join("")}
    `
  const linkList =
    (s.links ?? []).length === 0
      ? ""
      : `${(s.links ?? [])
          .map(
            (l) =>
              `<p style="margin:0 0 10px 0;font-family:${SERIF};font-size:16px;line-height:1.65;color:${INK};"><a href="${esc(l.href)}" style="color:${INK};">${esc(l.title)}</a>${l.note !== null ? `<span style="font-family:${MONO};font-size:13px;color:${QUIET};"> — ${esc(l.note)}</span>` : ""}</p>`
          )
          .join("")}
    `
  const hasDiffer = s.differBullets.length > 0 || s.differParagraphs.length > 0
  const differSection = !hasDiffer
    ? ""
    : `<p style="margin:16px 0 8px 0;font-family:${MONO};font-size:12px;letter-spacing:1px;text-transform:uppercase;color:${CLARET};">Where the accounts differ</p>
    ${differ}
    `
  const sourcesLine = s.sources.length === 0 ? "" : `${monoLine(`Sources&ensp;${sources}`)}
    `
  return `
  <div style="border-top:1px solid ${HAIRLINE};padding:26px 0 12px 0;">
    ${fold}
    <h2 style="margin:0 0 14px 0;font-family:${SERIF};font-size:21px;line-height:1.35;font-weight:600;color:${INK};">${esc(s.headline)}</h2>
    ${byline}${s.bodyParagraphs.map(para).join("")}
    ${dataList}${linkList}${differSection}${sourcesLine}${balance}
  </div>`
}

export type EmailCorrection = EditionCorrection

/** One section of the email, as the paper groups it (generation 3). */
export interface EmailSection {
  readonly slug: string
  readonly name: string
  readonly stories: ReadonlyArray<HtmlStory>
}

/** The morning email's one section card (generation 3): after the brief
 * ends, one other desk's name, its lead line, and a button to it on the
 * site. One desk per morning, the run id decides which. */
export interface EmailCard {
  readonly name: string
  readonly headline: string
  readonly href: string
  readonly count: number
}

export const renderEmailEdition = (opts: {
  readonly runId: string
  readonly stories: ReadonlyArray<HtmlStory>
  readonly corrections?: ReadonlyArray<EmailCorrection>
  /** The stories grouped by section, when the paper has more than one.
   * Must cover exactly `stories`, in the same order. */
  readonly sections?: ReadonlyArray<EmailSection>
  /** The section card, on a paper with more desks than the mail carries;
   * null or absent otherwise. */
  readonly card?: EmailCard | null
  /** True on a paper with more desks than the mail carries: two short
   * lines, top and bottom, say so and point at the site. */
  readonly more?: boolean
}): { subject: string; html: string; text: string } => {
  const date = longDate(opts.runId)
  const editionUrl = `${SITE_URL}/${opts.runId}.html`
  const corrections = opts.corrections ?? []
  const more = opts.more === true
  const moreLine = !more
    ? ""
    : `\n    <p style="margin:10px 0 0 0;font-family:${MONO};font-size:12px;color:${QUIET};">There is more to ${esc(PAPER_NAME)} than the brief — <a href="${editionUrl}" style="color:${QUIET};">the whole paper is on ${esc(SITE_HOST)}</a>.</p>`
  const card = opts.card ?? null
  const cardHtml =
    card === null
      ? ""
      : `
  <div style="border-top:1px solid ${HAIRLINE};padding:22px 0 6px 0;">
    <div style="border:1px solid ${HAIRLINE};padding:18px 20px;">
      <p style="margin:0 0 8px 0;font-family:${MONO};font-size:12px;letter-spacing:1px;text-transform:uppercase;color:${QUIET};">Also in today's paper · ${esc(card.name)}</p>
      <p style="margin:0 0 14px 0;font-family:${SERIF};font-size:19px;line-height:1.35;font-weight:600;color:${INK};">${esc(card.headline)}</p>
      <p style="margin:0;"><a href="${esc(card.href)}" style="display:inline-block;padding:9px 16px;border:1px solid ${INK};background:${INK};color:#ffffff;font-family:${MONO};font-size:13px;text-decoration:none;">Read today's ${esc(card.name)} desk →</a> <span style="font-family:${MONO};font-size:12px;color:${QUIET};">${card.count} item${card.count === 1 ? "" : "s"}</span></p>
    </div>
  </div>`
  // A single-section paper renders exactly as generation 2 did; several
  // desks each get a label line before their stories.
  const groups: ReadonlyArray<{ name: string | null; stories: ReadonlyArray<HtmlStory> }> =
    opts.sections !== undefined && opts.sections.length > 1
      ? opts.sections
      : [{ name: null, stories: opts.stories }]
  const storiesHtml = groups
    .map(
      (g) =>
        (g.name === null
          ? ""
          : `\n  <div style="border-top:2px solid ${INK};padding:24px 0 0 0;">
    <p style="margin:0;font-family:${MONO};font-size:12px;letter-spacing:1px;text-transform:uppercase;color:${INK};">${esc(g.name)}</p>
  </div>\n`) + g.stories.map(storyBlock).join("\n")
    )
    .join("\n")
  const correctionsHtml =
    corrections.length === 0
      ? ""
      : `
  <div style="border-top:1px solid ${HAIRLINE};padding:20px 0 8px 0;">
    <p style="margin:0 0 10px 0;font-family:${MONO};font-size:12px;letter-spacing:1px;text-transform:uppercase;color:${CLARET};">Corrections</p>
    ${corrections
          .map(
            (c) =>
              `<p style="margin:0 0 12px 0;font-family:${SERIF};font-size:15px;line-height:1.6;color:${INK};">In the edition of <a href="${SITE_URL}/${esc(c.edition)}.html" style="color:${INK};">${esc(longDate(c.edition))}</a>, the story &ldquo;${esc(c.headline)}&rdquo;: ${esc(c.note)} The original stands unchanged in the archive.</p>`
          )
          .join("")}
  </div>`

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;">
<div style="max-width:620px;margin:0 auto;padding:28px 20px;">
  <div style="text-align:center;padding-bottom:22px;">
    <p style="margin:0;font-family:${SERIF};font-size:44px;font-weight:500;color:${INK};">${esc(PAPER_NAME)}<span style="color:${CLARET};">.</span></p>
    <p style="margin:6px 0 0 0;font-family:${MONO};font-size:12px;color:${QUIET};">${esc(PAPER_MOTTO)}</p>
    <p style="margin:6px 0 0 0;font-family:${MONO};font-size:12px;letter-spacing:1px;text-transform:uppercase;color:${INK};">${esc(date)}</p>${moreLine}
  </div>${correctionsHtml}
${storiesHtml}
  <div style="border-top:1px solid ${HAIRLINE};padding:22px 0;text-align:center;">
    <p style="margin:0 0 10px 0;font-family:${MONO};font-size:12px;color:${QUIET};"><a href="${editionUrl}" style="color:${QUIET};">Read this edition on ${esc(SITE_HOST)}</a> · <a href="${SITE_URL}/sources.html" style="color:${QUIET};">How we choose our sources</a></p>
    <p style="margin:0 0 14px 0;font-family:${SERIF};font-size:15px;font-style:italic;color:${QUIET};">The brief ends here.</p>${cardHtml === "" ? "" : `\n  <div style="text-align:left;">${cardHtml}\n  </div>`}${moreLine === "" ? "" : `\n    <p style="margin:0 0 14px 0;font-family:${MONO};font-size:12px;color:${QUIET};">There is more to ${esc(PAPER_NAME)} than the brief — <a href="${editionUrl}" style="color:${QUIET};">the whole paper is on ${esc(SITE_HOST)}</a>.</p>`}
    <p style="margin:0;font-family:${MONO};font-size:11px;color:${QUIET};"><a href="{{amazonSESUnsubscribeUrl}}" style="color:${QUIET};">Unsubscribe</a> — one click, no questions.</p>
  </div>
</div>
</body></html>`

  const text = [
    `${PAPER_NAME} — ${date}`,
    PAPER_MOTTO,
    "",
    ...groups.flatMap((g) => [
      ...(g.name === null ? [] : ["═══", g.name.toUpperCase()]),
      ...g.stories.flatMap((s) => [
      "———",
      s.foldReason === null ? "" : `BELOW THE FOLD — nominated because: ${s.foldReason}`,
      s.headline.toUpperCase(),
      s.byline === undefined || s.byline === null ? "" : `By ${s.byline}`,
      "",
      ...s.bodyParagraphs,
      ...(s.data ?? []).map(
        (d) => `${d.label}: ${d.value}${d.note !== null ? ` (${d.note})` : ""}`
      ),
      ...(s.links ?? []).map(
        (l) => `- ${l.title} <${l.href}>${l.note !== null ? ` — ${l.note}` : ""}`
      ),
      "",
      ...(s.differBullets.length > 0 || s.differParagraphs.length > 0
        ? [
            "WHERE THE ACCOUNTS DIFFER",
            ...(s.differBullets.length > 0
              ? s.differBullets.map((b) => `- ${b}`)
              : s.differParagraphs),
            ""
          ]
        : []),
      s.sources.length > 0
        ? `Sources: ${s.sources.map((x) => (x.href ? `${x.name} <${x.href}>` : x.name)).join(" · ")}`
        : "",
      s.balanceNote ?? "",
      ""
    ])
    ]).filter((l) => l !== ""),
    "———",
    `Read on the web: ${editionUrl}`,
    "The brief ends here.",
    ...(card === null
      ? []
      : [
          "",
          `ALSO IN TODAY'S PAPER · ${card.name.toUpperCase()}`,
          card.headline,
          `Read today's ${card.name} desk: ${card.href}`
        ]),
    ...(more ? [`There is more to ${PAPER_NAME} than the brief — the whole paper: ${editionUrl}`] : []),
    "Unsubscribe: {{amazonSESUnsubscribeUrl}}"
  ].join("\n")

  return { subject: `${PAPER_NAME} — ${date}`, html, text }
}
