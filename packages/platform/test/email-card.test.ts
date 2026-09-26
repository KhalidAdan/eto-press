/**
 * The morning email on a sectioned paper (generation 3): the first section
 * in full, one section card after the end mark, two "more to the paper"
 * lines — and nothing of that on a single-section paper.
 */
import { describe, expect, it } from "vitest"
import { editionStoryFrom } from "../src/edition.js"
import { renderEmailEdition } from "../src/email.js"
import { renderFeedXml } from "../src/feed.js"

const story = editionStoryFrom({
  headline: "The lead",
  body: "The brief speaks.",
  differ: "",
  sourcesLine: "",
  balanceNote: null,
  foldReason: null,
  linkByOutlet: new Map()
})

describe("the email's section card", () => {
  const withCard = renderEmailEdition({
    runId: "2026-09-26",
    stories: [story],
    more: true,
    card: { name: "Sports", headline: "Raptors 104, Celtics 99", href: "http://localhost/2026-09-26.html#sports", count: 3 }
  })

  it("prints the card after the end mark, before the unsubscribe line", () => {
    const end = withCard.html.indexOf("The brief ends here.")
    const card = withCard.html.indexOf("Also in today's paper · Sports")
    const unsubscribe = withCard.html.indexOf("Unsubscribe")
    expect(end).toBeGreaterThan(-1)
    expect(card).toBeGreaterThan(end)
    expect(unsubscribe).toBeGreaterThan(card)
    expect(withCard.html).toContain("Raptors 104, Celtics 99")
    expect(withCard.html).toContain('href="http://localhost/2026-09-26.html#sports"')
    expect(withCard.html).toContain("Read today's Sports desk")
  })

  it("says there is more, top and bottom", () => {
    expect(withCard.html.match(/There is more to your paper than the brief/g)).toHaveLength(2)
    expect(withCard.text).toContain("ALSO IN TODAY'S PAPER · SPORTS")
    expect(withCard.text).toContain("There is more to your paper than the brief")
  })

  it("prints none of it on a single-section paper", () => {
    const plain = renderEmailEdition({ runId: "2026-09-26", stories: [story] })
    expect(plain.html).not.toContain("Also in today's paper")
    expect(plain.html).not.toContain("There is more to")
    expect(plain.text).not.toContain("ALSO IN TODAY'S PAPER")
  })
})

describe("per-section feeds", () => {
  const editions = [{ runId: "2026-09-26", stories: [story], corrections: [] }]

  it("the paper's feed is unchanged: self link at /feed.xml, items at the edition", () => {
    const xml = renderFeedXml(editions)
    expect(xml).toContain('href="http://localhost/feed.xml" rel="self"')
    expect(xml).toContain("<link>http://localhost/2026-09-26.html</link>")
    expect(xml).toContain("<title>your paper</title>")
  })

  it("a section's feed names the desk and links its items to the desk's anchor", () => {
    const xml = renderFeedXml(editions, {
      path: "/sports/feed.xml",
      section: { slug: "sports", name: "Sports" }
    })
    expect(xml).toContain('href="http://localhost/sports/feed.xml" rel="self"')
    expect(xml).toContain("<link>http://localhost/2026-09-26.html#sports</link>")
    expect(xml).toContain("<title>your paper — Sports</title>")
  })
})
