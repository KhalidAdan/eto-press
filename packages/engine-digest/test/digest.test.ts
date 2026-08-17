import { describe, expect, it } from "vitest"
import type { Item } from "@eto-press/platform/normalize"
import { sectionize, toLinkItem } from "../src/engine.js"

const item = (side: string, title: string, summary = ""): Item => ({
  id: 0,
  outlet: `${side} Outlet`,
  side,
  kind: "news",
  title,
  summary,
  link: `https://example.org/${side}/${title.replaceAll(" ", "-")}`,
  publishedAt: new Date()
})

describe("sectionize", () => {
  it("groups links under sections in masthead order, deduplicated", () => {
    const sections = sectionize(
      ["Tech", "World", "Tech"],
      [item("World", "w1"), item("Tech", "t1"), item("Tech", "t2")]
    )
    expect(sections.map((s) => s.section)).toEqual(["Tech", "World"])
    expect(sections[0]!.links).toHaveLength(2)
  })

  it("omits sections with no fresh links entirely", () => {
    const sections = sectionize(["Tech", "World"], [item("World", "w1")])
    expect(sections.map((s) => s.section)).toEqual(["World"])
  })

  it("caps a section at eight links", () => {
    const many = Array.from({ length: 12 }, (_, i) => item("Tech", `t${i}`))
    const sections = sectionize(["Tech"], many)
    expect(sections[0]!.links).toHaveLength(8)
  })
})

describe("toLinkItem", () => {
  it("carries the outlet and the feed's own blurb in the note", () => {
    const link = toLinkItem(item("Tech", "A title", "A short blurb from the feed."))
    expect(link.note).toBe("Tech Outlet · A short blurb from the feed.")
  })

  it("falls back to the outlet alone when the feed has no blurb", () => {
    const link = toLinkItem(item("Tech", "A title"))
    expect(link.note).toBe("Tech Outlet")
  })
})
