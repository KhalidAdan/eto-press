import { describe, expect, it } from "vitest"
import type { Masthead } from "@eto-press/platform/masthead"
import type { Item } from "@eto-press/platform/normalize"
import {
  decide,
  fillTemplate,
  LIST_ROWS_MAX,
  listRows,
  motionNote,
  parseColumn,
  parseDoor,
  partition,
  ROWS_PER_SHELF,
  shelve,
  toRow
} from "../src/engine.js"

describe("list doors (generation 3)", () => {
  // TheSportsDB's eventspastleague shape, trimmed.
  const now = Date.parse("2026-10-04T12:00:00Z")
  const body = JSON.stringify({
    events: [
      { strAwayTeam: "Miami Heat", strHomeTeam: "Toronto Raptors", intAwayScore: "99", intHomeScore: "104", strTimestamp: "2026-10-03T23:00:00" },
      { strAwayTeam: "Boston Celtics", strHomeTeam: "New York Knicks", intAwayScore: null, intHomeScore: null, strTimestamp: "2026-10-04T23:30:00" },
      { strAwayTeam: "New York Knicks", strHomeTeam: "San Antonio Spurs", intAwayScore: "88", intHomeScore: "101", strTimestamp: "2026-06-14T00:30:00" }
    ]
  })
  const source = {
    label: "{strAwayTeam} @ {strHomeTeam}",
    value: "{intAwayScore}–{intHomeScore}",
    when: "strTimestamp"
  }

  it("fills a template from an entry, and refuses one with a missing field", () => {
    expect(fillTemplate("{a} @ {b.c}", { a: "X", b: { c: 2 } })).toBe("X @ 2")
    expect(fillTemplate("{a}–{b}", { a: "1", b: null })).toBeNull()
    expect(fillTemplate("{a}", { a: "  " })).toBeNull()
  })

  it("prints last night's finished games and nothing older or unplayed", () => {
    expect(listRows(body, "events", source, now)).toEqual([
      { label: "Miami Heat @ Toronto Raptors", value: "99–104" }
    ])
  })

  it("without a timestamp field, prints every entry that can fill its row", () => {
    const rows = listRows(body, "events", { label: source.label, value: source.value }, now)
    expect(rows?.map((r) => r.value)).toEqual(["99–104", "88–101"])
  })

  it("is null for a path that misses the array, a body that isn't JSON, or missing templates", () => {
    expect(listRows(body, "nope", source, now)).toBeNull()
    expect(listRows("<html>", "events", source, now)).toBeNull()
    expect(listRows(body, "events", { value: "{x}" }, now)).toBeNull()
  })

  it("caps a board", () => {
    const many = JSON.stringify({ e: Array.from({ length: 40 }, (_, i) => ({ a: `t${i}`, b: i })) })
    expect(listRows(many, "e", { label: "{a}", value: "{b}" }, now)).toHaveLength(LIST_ROWS_MAX)
  })

  it("partition puts list doors on the boards", () => {
    const m: Masthead = {
      source: [
        { name: "NBA results", side: "Scores", feeds: ["https://x/api#events"], kind: "list", label: "{a}", value: "{b}" },
        { name: "A Writer", side: "Trade talk", feeds: ["https://x/feed"] }
      ]
    }
    expect(partition(m).doors.map((s) => s.name)).toEqual(["NBA results"])
    expect(partition(m).feeds.map((s) => s.name)).toEqual(["A Writer"])
  })
})

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
