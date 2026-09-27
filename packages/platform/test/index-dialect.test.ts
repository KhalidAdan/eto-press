/**
 * The index dialect (generation 3): the paper compressed to one row per
 * item, derived from published anatomy alone; and the morning email's
 * section card, picked the same way twice.
 */
import { describe, expect, it } from "vitest"
import { editionStoryFrom, type EditionStory } from "../src/edition.js"
import {
  buildIndex,
  firstSentence,
  pickCard,
  renderIndex,
  rowsOf,
  sourceDomain,
  stableHash
} from "../src/index-dialect.js"

const prose = (headline: string, body: string, extra: Partial<Parameters<typeof editionStoryFrom>[0]> = {}): EditionStory =>
  editionStoryFrom({
    headline,
    body,
    differ: "",
    sourcesLine: "",
    balanceNote: null,
    foldReason: null,
    linkByOutlet: new Map(),
    ...extra
  })

describe("firstSentence", () => {
  it("takes the first sentence, flattened", () => {
    expect(firstSentence("The Fed held rates.\n\nMarkets shrugged. Again.")).toBe("The Fed held rates.")
  })
  it("keeps a sentence-less text whole, and nothing from nothing", () => {
    expect(firstSentence("no terminal punctuation here")).toBe("no terminal punctuation here")
    expect(firstSentence("   ")).toBeNull()
  })
  it("does not split on a decimal point", () => {
    expect(firstSentence("The index rose 0.4 percent on the day. Then fell.")).toBe(
      "The index rose 0.4 percent on the day."
    )
  })
  it("caps a runaway first sentence", () => {
    expect(firstSentence("word ".repeat(100) + ".")!.length).toBeLessThanOrEqual(220)
  })
})

describe("sourceDomain", () => {
  it("strips the scheme, path and www", () => {
    expect(sourceDomain("https://www.ft.com/content/abc")).toBe("ft.com")
    expect(sourceDomain("not a url")).toBeNull()
  })
})

describe("rowsOf", () => {
  it("a prose story is one row: headline, first sentence, first source", () => {
    const story = prose("Fed holds", "Two members dissented. More.", {
      sourcesLine: "FT - Reuters",
      linkByOutlet: new Map([["FT", "https://ft.com/a"]])
    })
    expect(rowsOf(story, "./2026-09-26.html#s3")).toEqual([
      {
        kicker: null,
        headline: "Fed holds",
        href: "./2026-09-26.html#s3",
        deck: "Two members dissented.",
        source: "FT"
      }
    ])
  })

  it("prefers the engine's deck to the first sentence", () => {
    const story = prose("H", "First. Second.", { deck: "The desk's line." })
    expect(rowsOf(story, "#")[0]!.deck).toBe("The desk's line.")
  })

  it("a bylined story carries its byline as the kicker; a fold story its tag", () => {
    expect(rowsOf(prose("H", "B.", { byline: "Khalid" }), "#")[0]!.kicker).toBe("By Khalid")
    expect(rowsOf(prose("H", "B.", { foldReason: "because" }), "#")[0]!.kicker).toBe("Below the fold")
  })

  it("a link-list story is one row per link, decked by the note, sourced by domain", () => {
    const story = prose("Tech", "", {
      links: [
        { title: "A post", href: "https://www.example.org/p", note: "Argues X." },
        { title: "Another", href: "https://blog.test/q", note: null }
      ]
    })
    const rows = rowsOf(story, "#")
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ headline: "A post", deck: "Argues X.", source: "example.org" })
    expect(rows[1]).toMatchObject({ headline: "Another", deck: null, source: "blog.test" })
  })

  it("a bodiless data story contributes no row (its figures go on the board)", () => {
    expect(rowsOf(prose("Rates", "", { data: [{ label: "10y", value: "4.11", note: null }] }), "#")).toEqual([])
  })
})

describe("buildIndex", () => {
  const sections = [
    {
      slug: "business",
      name: "Business",
      stories: [
        prose("Rates", "", { data: [{ label: "10y", value: "4.11", note: "▲ +0.03 since last edition" }] }),
        prose("Fed holds", "Two dissented.")
      ]
    },
    {
      slug: "sports",
      name: "Sports",
      stories: [prose("Fold", "Late.", { foldReason: "r" }), prose("Main", "Early.")]
    }
  ]
  const desks = buildIndex(sections, { editionHref: "./2026-09-26.html", first: 4 })

  it("numbers anchors from `first`, mains before folds, across desks", () => {
    // business: positions 4 (board, no row) and 5; sports: main 6, fold 7.
    expect(desks[0]!.rows[0]!.href).toBe("./2026-09-26.html#s5")
    expect(desks[1]!.rows.map((r) => r.href)).toEqual(["./2026-09-26.html#s6", "./2026-09-26.html#s7"])
  })

  it("puts figures on the board and counts rows plus figures", () => {
    expect(desks[0]!.board).toEqual([{ label: "10y", value: "4.11", note: "▲ +0.03 since last edition" }])
    expect(desks[0]!.count).toBe(2)
    expect(desks[0]!.href).toBe("./2026-09-26.html#business")
  })
})

describe("renderIndex", () => {
  it("is empty for nothing, and labels each desk with its count", () => {
    expect(renderIndex([])).toBe("")
    const html = renderIndex(
      buildIndex(
        [{ slug: "blogs", name: "Blogs", stories: [prose("A", "One. Two.", { sourcesLine: "X", linkByOutlet: new Map() })] }],
        { editionHref: "./d.html", first: 1 }
      )
    )
    expect(html).toContain('class="index"')
    expect(html).toContain("In today&#39;s paper".replace("&#39;", "'"))
    expect(html).toContain(">Blogs</a>")
    expect(html).toContain('class="index__count instrument--quiet">1<')
    expect(html).toContain("Blogs ends here.")
    expect(html).toContain('class="index__deck prose"> One.<')
  })

  it("escapes what it prints", () => {
    const html = renderIndex(
      buildIndex([{ slug: "x", name: "A <b>desk</b>", stories: [prose("<i>H</i>", "B.")] }], {
        editionHref: "./d.html",
        first: 1
      })
    )
    expect(html).not.toContain("<b>desk</b>")
    expect(html).toContain("&lt;i&gt;H&lt;/i&gt;")
  })
})

describe("pickCard", () => {
  const desks = [
    { slug: "a", count: 2 },
    { slug: "b", count: 0 },
    { slug: "c", count: 5 }
  ]
  it("never picks a desk that printed nothing", () => {
    for (const day of ["2026-09-26", "2026-09-27", "2026-09-28", "2026-10-01"]) {
      expect(pickCard(day, desks)!.slug).not.toBe("b")
    }
  })
  it("is stable for a morning and varies across mornings", () => {
    expect(pickCard("2026-09-26", desks)).toBe(pickCard("2026-09-26", desks))
    const picks = new Set(
      Array.from({ length: 30 }, (_, i) => pickCard(`2026-10-${String(i + 1).padStart(2, "0")}`, desks)!.slug)
    )
    expect(picks.size).toBe(2)
  })
  it("is null with nothing to advertise", () => {
    expect(pickCard("2026-09-26", [{ count: 0 }])).toBeNull()
    expect(pickCard("2026-09-26", [])).toBeNull()
  })
  it("hashes deterministically", () => {
    expect(stableHash("2026-09-26")).toBe(stableHash("2026-09-26"))
    expect(stableHash("2026-09-26")).not.toBe(stableHash("2026-09-27"))
  })
})
