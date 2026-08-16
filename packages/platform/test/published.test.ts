import { describe, expect, it } from "vitest"
import { editionStoryFrom } from "../src/edition.js"
import { fromRow, toRow } from "../src/published.js"

const links = new Map([
  ["The Guardian", "https://example.org/guardian"],
  ["Reuters", "https://example.org/reuters"]
])

describe("the published-edition store round-trip", () => {
  it("preserves a full eto story — content, links, measurements, ref", () => {
    const story = editionStoryFrom({
      headline: 'Headline with "quotes" & ampersands',
      body: "First paragraph.\n\nSecond paragraph.",
      differ: "* Outlet A says X\n* Outlet B says Y",
      sourcesLine: "The Guardian - Reuters",
      balanceNote: "No source labeled right covered this story.",
      foldReason: "Consequence exceeds coverage.",
      linkByOutlet: links,
      engineRef: "abc123"
    })
    const back = fromRow(toRow("2026-08-16", 3, story))
    expect(back).toEqual(story)
  })

  it("preserves a desk story — empty anatomy stays empty", () => {
    const story = editionStoryFrom({
      headline: "On quiet days",
      body: "Some mornings there is nothing to add.",
      differ: "",
      sourcesLine: "",
      balanceNote: null,
      foldReason: null,
      linkByOutlet: new Map(),
      engineRef: "desk:deadbeef"
    })
    const back = fromRow(toRow("2026-08-16", 1, story))
    expect(back).toEqual(story)
    expect(back.differBullets).toHaveLength(0)
    expect(back.differParagraphs).toHaveLength(0)
    expect(back.sources).toHaveLength(0)
  })

  it("keeps the links exactly as resolved at publish, not re-resolved", () => {
    const story = editionStoryFrom({
      headline: "H",
      body: "B",
      differ: "D",
      sourcesLine: "The Guardian - Reuters - FOX News",
      balanceNote: null,
      foldReason: null,
      linkByOutlet: links
    })
    // FOX resolved to no link at publish; the row must preserve that
    // exact outcome even though fromRow rebuilds with an empty link map.
    const back = fromRow(toRow("2026-08-16", 1, story))
    expect(back.sources).toEqual(story.sources)
    expect(back.sources.find((s) => s.name === "FOX News")?.href).toBeNull()
    expect(back.sources.find((s) => s.name === "Reuters")?.href).toBe(
      "https://example.org/reuters"
    )
  })
})
