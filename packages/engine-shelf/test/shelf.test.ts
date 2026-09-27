import { describe, expect, it } from "vitest"
import type { Item } from "@eto-press/platform/normalize"
import { ROWS_PER_SHELF, shelve, toRow } from "../src/engine.js"

const post = (side: string, title: string, at = "2026-09-26T08:00:00Z", summary = ""): Item => ({
  id: 0,
  outlet: `${side} Writer`,
  side,
  kind: "news",
  title,
  summary,
  link: `https://example.org/${side}/${title.replaceAll(" ", "-")}`,
  publishedAt: new Date(at)
})

describe("shelve", () => {
  it("groups posts under shelves in masthead order, deduplicated, newest first", () => {
    const shelves = shelve(
      ["Tech", "Essays", "Tech"],
      [
        post("Essays", "e1"),
        post("Tech", "older", "2026-09-25T08:00:00Z"),
        post("Tech", "newer", "2026-09-26T09:00:00Z")
      ]
    )
    expect(shelves.map((s) => s.shelf)).toEqual(["Tech", "Essays"])
    expect(shelves[0]!.posts.map((p) => p.title)).toEqual(["newer", "older"])
  })

  it("omits shelves with nothing new", () => {
    expect(shelve(["Tech", "Essays"], [post("Essays", "e1")]).map((s) => s.shelf)).toEqual(["Essays"])
  })

  it("caps a shelf", () => {
    const many = Array.from({ length: ROWS_PER_SHELF + 5 }, (_, i) => post("Tech", `t${i}`))
    expect(shelve(["Tech"], many)[0]!.posts).toHaveLength(ROWS_PER_SHELF)
  })
})

describe("toRow", () => {
  it("links the post and names the writer, with the deck when there is one", () => {
    const p = post("Tech", "A title")
    expect(toRow(p, "Argues that sync is the product.")).toEqual({
      title: "A title",
      href: "https://example.org/Tech/A-title",
      note: "Tech Writer · Argues that sync is the product."
    })
    expect(toRow(p, null).note).toBe("Tech Writer")
  })
})
