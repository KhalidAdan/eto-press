/**
 * The site (generation 3): the front page is the lead in full plus the
 * index; desks have dated pages with neighbours; the archive is a
 * calendar; the about page names the constitution when the paper does;
 * the spectrum is monochrome. No manifesto on the front page.
 */
import { describe, expect, it } from "vitest"
import { editionStoryFrom } from "../src/edition.js"
import {
  renderCalendar,
  renderHomePage,
  renderSectionPage,
  renderSourcesPage,
  sideSpectrum
} from "../src/html.js"

const story = (headline: string) =>
  editionStoryFrom({
    headline,
    body: "The body.",
    differ: "",
    sourcesLine: "",
    balanceNote: null,
    foldReason: null,
    linkByOutlet: new Map()
  })

describe("the front page", () => {
  const html = renderHomePage({
    runId: "2026-09-26",
    lead: [story("The lead"), story("The second")],
    leadEnd: "Current events brief ends here.",
    counts: "Business 4 · Sports 3",
    index: '    <section class="index">the index</section>',
    calendar: [{ runId: "2026-09-26", lead: "The lead", sections: 3 }],
    feeds: [{ name: "Sports", path: "./sports/feed.xml" }]
  })

  it("carries the date line under the nameplate and the ears", () => {
    const wordmark = html.indexOf('class="masthead__wordmark"')
    const date = html.indexOf("Saturday, September 26, 2026")
    expect(date).toBeGreaterThan(wordmark)
    expect(html).toContain('class="masthead__ear masthead__ear--counts">Business 4 · Sports 3<')
  })

  it("prints the lead in full, then its end line, then the index", () => {
    const lead = html.indexOf('id="s1"')
    const end = html.indexOf("Current events brief ends here.")
    const index = html.indexOf('class="index"')
    expect(lead).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(lead)
    expect(index).toBeGreaterThan(end)
    expect(html).toContain('id="s2"')
  })

  it("has no manifesto and no cards", () => {
    expect(html).not.toContain("takes a single event")
    expect(html).not.toContain('class="cards"')
  })

  it("lists the feeds and ends", () => {
    expect(html).toContain('href="./sports/feed.xml"')
    expect(html.trimEnd().endsWith("</html>")).toBe(true)
    expect(html).toContain("That is the paper for today.")
  })

  it("omits the counts ear on a single-section paper", () => {
    const single = renderHomePage({
      runId: "2026-09-26",
      lead: [story("Only")],
      leadEnd: "The brief ends here.",
      counts: "",
      calendar: []
    })
    expect(single).not.toContain("masthead__ear--counts")
    expect(single).toContain("The brief ends here.")
  })
})

describe("the calendar", () => {
  it("groups mornings by month, newest first, with the lead and the desk count", () => {
    const html = renderCalendar([
      { runId: "2026-08-30", lead: "August lead", sections: 1 },
      { runId: "2026-09-26", lead: "September lead", sections: 3 },
      { runId: "2026-09-25", lead: null, sections: 2 }
    ])
    expect(html.indexOf("September 2026")).toBeLessThan(html.indexOf("August 2026"))
    expect(html.indexOf("Fri 25")).toBeGreaterThan(html.indexOf("Sat 26"))
    expect(html).toContain('href="./2026-09-26.html"')
    expect(html).toContain("September lead")
    expect(html).toContain("3 desks")
    expect(html).toContain("1 desk<")
  })

  it("prints no desk counts on a single-section paper", () => {
    expect(renderCalendar([{ runId: "2026-09-26", lead: "L", sections: 1 }])).not.toContain("desk")
  })
})

describe("a section page", () => {
  const html = renderSectionPage({
    runId: "2026-09-26",
    section: { slug: "sports", name: "Sports", stories: [story("Raptors win")] },
    first: 7,
    position: 2,
    total: 4,
    prev: { slug: "business", name: "Business" },
    next: { slug: "blogs", name: "Blogs" }
  })

  it("keeps paper-global anchors and names its place", () => {
    expect(html).toContain('id="s7"')
    expect(html).toContain("Section 2 of 4")
    expect(html).toContain('href="../business/" rel="prev"')
    expect(html).toContain('href="../blogs/" rel="next"')
    expect(html).toContain("Sports ends here.")
  })

  it("resolves the stylesheet and the whole paper from two directories down", () => {
    expect(html).toContain('href="../../brief.css"')
    expect(html).toContain('href="../../2026-09-26.html#sports"')
  })
})

describe("the about page", () => {
  const bySide = [{ side: "center", outlets: ["Wire Service"] }]

  it("names the constitution when the paper does, and not otherwise", () => {
    expect(renderSourcesPage(bySide, null, { constitutionUrl: "https://example.org/NORTH-STAR.md" })).toContain(
      'href="https://example.org/NORTH-STAR.md"'
    )
    expect(renderSourcesPage(bySide, null)).not.toContain("the constitution</a>")
  })

  it("says whose paper it is, without the old manifesto", () => {
    const html = renderSourcesPage(bySide, null)
    expect(html).toContain("printed by its editor's own press")
    expect(html).toContain("About this paper")
  })
})

describe("the spectrum, monochrome", () => {
  it("renders every known position, filled where present and hollow where not", () => {
    const html = sideSpectrum(["left", "right"])
    expect(html).toContain('spectrum__side--on side--left"')
    expect(html).toContain('spectrum__side--off side--center"')
    expect(html).toContain('spectrum__side--on side--right"')
    expect(html.match(/spectrum__side--off/g)).toHaveLength(3)
  })
})
