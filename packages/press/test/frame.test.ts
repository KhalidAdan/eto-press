/**
 * The frame's pure parts (generation 3): binding section outcomes into a
 * morning, and the one-feed-one-section rule.
 */
import { describe, expect, it } from "vitest"
import type { EngineOutcome } from "@eto-press/platform/engine"
import type { Masthead } from "@eto-press/platform/masthead"
import { bindOutcomes, duplicateFeeds } from "../src/run.js"

const edition = (n: number): EngineOutcome => ({
  _tag: "Edition",
  stories: Array.from({ length: n }, (_, i) => ({
    headline: `s${i}`,
    body: "",
    differ: "",
    sourcesLine: "",
    bodyParagraphs: [],
    differBullets: [],
    differParagraphs: [],
    sources: [],
    balanceNote: null,
    foldReason: null
  })),
  report: { feedOutcomes: [], dropped: [] },
  advisoryLines: []
})

describe("bindOutcomes", () => {
  it("keeps printed sections in order and records the absent ones with their reason", () => {
    const bound = bindOutcomes([
      { decl: { slug: "brief", name: "Brief" }, outcome: edition(2) },
      { decl: { slug: "sports", name: "Sports" }, outcome: { _tag: "NoEdition", reason: "off-season" } },
      { decl: { slug: "blogs", name: "Blogs" }, outcome: edition(1) }
    ])
    expect(bound.sections.map((s) => s.slug)).toEqual(["brief", "blogs"])
    expect(bound.sections[0]!.stories).toHaveLength(2)
    expect(bound.absent).toEqual([{ slug: "sports", name: "Sports", reason: "off-season" }])
  })

  it("every section silent is an empty binding — the paper's NoEdition", () => {
    const bound = bindOutcomes([
      { decl: { slug: "a", name: "A" }, outcome: { _tag: "NoEdition", reason: "x" } },
      { decl: { slug: "b", name: "B" }, outcome: { _tag: "NoEdition", reason: "y" } }
    ])
    expect(bound.sections).toHaveLength(0)
    expect(bound.absent).toHaveLength(2)
  })
})

describe("duplicateFeeds", () => {
  const masthead = (feeds: [string, ...Array<string>]): Masthead => ({
    source: [{ name: "Outlet", side: "center", feeds }]
  })

  it("passes a paper whose sections read different feeds of one outlet", () => {
    expect(
      duplicateFeeds([
        { decl: { slug: "brief" }, masthead: masthead(["https://o/world.rss"]) },
        { decl: { slug: "business" }, masthead: masthead(["https://o/business.rss"]) }
      ])
    ).toEqual([])
  })

  it("names a feed listed under two sections", () => {
    expect(
      duplicateFeeds([
        { decl: { slug: "brief" }, masthead: masthead(["https://o/all.rss"]) },
        { decl: { slug: "business" }, masthead: masthead(["https://o/all.rss"]) }
      ])
    ).toEqual([{ url: "https://o/all.rss", sections: ["brief", "business"] }])
  })

  it("ignores the same feed listed twice inside one section", () => {
    expect(
      duplicateFeeds([
        {
          decl: { slug: "brief" },
          masthead: {
            source: [
              { name: "A", side: "left", feeds: ["https://o/all.rss"] },
              { name: "B", side: "right", feeds: ["https://o/all.rss"] }
            ]
          } satisfies Masthead
        }
      ])
    ).toEqual([])
  })
})
