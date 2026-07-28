/**
 * The RSS feed: one item per edition, the complete brief as the item's
 * content. eto lives by reading other outlets' feeds through the front
 * door (NORTH-STAR §8); feed.xml is the same front door built into our
 * own house — reader-owned pull, chronological, finite, untrackable.
 *
 * Item content is semantic HTML with no styling: feed readers set their
 * own type, and that is exactly as it should be.
 */
import { SITE_DESCRIPTION, type HtmlCorrection, type HtmlStory, longDate } from "./html.js"
import { SITE_URL } from "./config.js"

const escXml = (s: string): string =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")

const escHtml = escXml

/** CDATA-safe: a literal "]]>" inside content would end the section. */
const cdata = (s: string): string => `<![CDATA[${s.replaceAll("]]>", "]]]]><![CDATA[>")}]]>`

const storyHtml = (s: HtmlStory): string => {
  const differ =
    s.differBullets.length > 0
      ? `<ul>${s.differBullets.map((b) => `<li>${escHtml(b)}</li>`).join("")}</ul>`
      : s.differParagraphs.map((p) => `<p>${escHtml(p)}</p>`).join("")
  const sources = s.sources
    .map((x) => (x.href ? `<a href="${escHtml(x.href)}">${escHtml(x.name)}</a>` : escHtml(x.name)))
    .join(" · ")
  return [
    s.foldReason !== null
      ? `<p><strong>Below the fold</strong> — the model's one nomination, reason printed: <em>${escHtml(s.foldReason)}</em></p>`
      : "",
    `<h2>${escHtml(s.headline)}</h2>`,
    ...s.bodyParagraphs.map((p) => `<p>${escHtml(p)}</p>`),
    `<h3>Where the accounts differ</h3>`,
    differ,
    `<p><strong>Sources</strong> ${sources}</p>`,
    s.balanceNote !== null ? `<p><em>${escHtml(s.balanceNote)}</em></p>` : ""
  ]
    .filter(Boolean)
    .join("\n")
}

export interface FeedEdition {
  readonly runId: string
  readonly stories: ReadonlyArray<HtmlStory>
  readonly corrections: ReadonlyArray<HtmlCorrection>
}

export const renderFeedXml = (editions: ReadonlyArray<FeedEdition>): string => {
  const items = editions
    .map((e) => {
      const url = `${SITE_URL}/${e.runId}.html`
      const corrections =
        e.corrections.length === 0
          ? ""
          : `<h3>Corrections</h3>\n` +
            e.corrections
              .map(
                (c) =>
                  `<p>In the edition of <a href="${SITE_URL}/${escHtml(c.edition)}.html">${escHtml(longDate(c.edition))}</a>, the story “${escHtml(c.headline)}”: ${escHtml(c.note)} The original stands unchanged in the archive.</p>`
              )
              .join("\n")
      const content = [
        corrections,
        e.stories.map(storyHtml).join("\n<hr/>\n"),
        `<hr/>\n<p><em>The brief ends here.</em></p>`
      ]
        .filter(Boolean)
        .join("\n")
      return `    <item>
      <title>${escXml(`eto — ${longDate(e.runId)}`)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${new Date(`${e.runId}T11:30:00Z`).toUTCString()}</pubDate>
      <description>${escXml(`The ${longDate(e.runId)} edition: ${e.stories.length} stories, each one event told through outlets that disagree.`)}</description>
      <content:encoded>${cdata(content)}</content:encoded>
    </item>`
    })
    .join("\n")

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>eto</title>
    <link>${SITE_URL}</link>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml"/>
    <description>${escXml(SITE_DESCRIPTION)}</description>
    <language>en</language>
${items}
  </channel>
</rss>
`
}
