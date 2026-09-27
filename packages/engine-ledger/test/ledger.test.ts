import { describe, expect, it } from "vitest"
import type { Masthead } from "@eto-press/platform/masthead"
import type { Item } from "@eto-press/platform/normalize"
import { decide, motionNote, parseColumn, parseDoor, partition, ROWS_PER_SHELF, shelve, toRow } from "../src/engine.js"

const masthead: Masthead = {
  source: [
    { name: "10Y Treasury", side: "Rates", feeds: ["https://api.example.org/rates.json#data.tenYear"], kind: "door" },
    { name: "S&P 500", side: "Markets", feeds: ["https://api.example.org/spx.txt"], kind: "door" },
    { name: "FT Markets", side: "Markets", feeds: ["https://ft.example.org/markets.rss"] },
    { name: "A Writer", side: "Trade talk", feeds: ["https://writer.example.org/feed"], kind: "feed" }
  ]
}

describe("partition", () => {
  it("doors are boards; feeds and unkinded sources are shelves", () => {
    const { doors, feeds } = partition(masthead)
    expect(doors.map((s) => s.name)).toEqual(["10Y Treasury", "S&P 500"])
    expect(feeds.map((s) => s.name)).toEqual(["FT Markets", "A Writer"])
  })
})

describe("parseDoor and motionNote (the wrap's, carried)", () => {
  it("splits the value path off a door", () => {
    expect(parseDoor("https://x/y.json#a.b")).toEqual({ url: "https://x/y.json", path: "a.b" })
    expect(parseDoor("https://x/y.txt")).toEqual({ url: "https://x/y.txt", path: null })
  })
  it("reports signed motion for numbers and an honest 'was' otherwise", () => {
    expect(motionNote("4.25", "4.12")).toBe("▲ +0.13 since last edition")
    expect(motionNote("BOS leads 2-1", "BOS leads 1-1")).toBe("was BOS leads 1-1")
    expect(motionNote("4.25", "4.25")).toBeNull()
    expect(motionNote("4.25", null)).toBeNull()
  })
})

describe("parseColumn (the sports engine's, carried)", () => {
  it("reads the headline, the byline and the take", () => {
    expect(parseColumn({ file: "x.md", content: "# On the bench\n\nby: Khalid\n\nThe take." })).toEqual({
      headline: "On the bench",
      byline: "Khalid",
      body: "The take."
    })
  })
})

describe("shelve and toRow", () => {
  const post = (side: string, title: string, at = "2026-09-26T08:00:00Z"): Item => ({
    id: 0,
    outlet: "A Writer",
    side,
    kind: "news",
    title,
    summary: "",
    link: `https://writer.example.org/${title}`,
    publishedAt: new Date(at)
  })
  it("groups newest first, capped, shelves in masthead order", () => {
    const shelves = shelve(
      ["Trade talk", "Markets"],
      [post("Markets", "m1"), post("Trade talk", "old", "2026-09-25T00:00:00Z"), post("Trade talk", "new")]
    )
    expect(shelves.map((s) => s.shelf)).toEqual(["Trade talk", "Markets"])
    expect(shelves[0]!.posts.map((p) => p.title)).toEqual(["new", "old"])
    expect(shelve(["X"], Array.from({ length: 20 }, (_, i) => post("X", `p${i}`)))[0]!.posts).toHaveLength(ROWS_PER_SHELF)
  })
  it("a row names the outlet, then the deck", () => {
    expect(toRow(post("Markets", "t"), "Says X.").note).toBe("A Writer · Says X.")
    expect(toRow(post("Markets", "t"), null).note).toBe("A Writer")
  })
})

describe("decide", () => {
  it("is silence only when nothing moved, no column, no post", () => {
    expect(decide({ moved: 0, columns: 0, posts: 0 })).toBe("silence")
    expect(decide({ moved: 1, columns: 0, posts: 0 })).toBe("print")
    expect(decide({ moved: 0, columns: 1, posts: 0 })).toBe("print")
    expect(decide({ moved: 0, columns: 0, posts: 1 })).toBe("print")
  })
})
