import { describe, expect, it } from "vitest"
import type { Cluster } from "../src/cluster.js"
import type { Masthead } from "../src/masthead.js"
import { dropAlreadyPrinted, dropLowDensity, selectStories, STORY_CAP } from "../src/select.js"

const masthead = {
  source: [
    { name: "FOX News", side: "right", feeds: ["x"] },
    { name: "NPR", side: "left", feeds: ["x"] },
    { name: "BBC", side: "center", feeds: ["x"] }
  ]
} as unknown as Masthead

let n = 0
const cluster = (outlets: Array<string>, sides: Array<string>): Cluster => ({
  hash: `hash-${n++}`,
  items: outlets.map((o, i) => ({
    id: n * 100 + i,
    outlet: o,
    side: sides[i % sides.length]!,
    kind: "news",
    title: `title ${i}`,
    summary: "",
    link: `https://example.com/${n}/${i}`,
    publishedAt: new Date()
  })),
  outlets: [...outlets].sort(),
  sides: [...new Set(sides)].sort(),
  density: 1,
  wasSplit: false
})

describe("selectStories", () => {
  it("ranks broader coverage first", () => {
    const wide = cluster(["FOX News", "NPR", "BBC"], ["right", "left", "center"])
    const narrow = cluster(["FOX News", "NPR"], ["right", "left"])
    const stories = selectStories(masthead, [narrow, wide])
    expect(stories[0]!.cluster).toBe(wide)
    expect(stories[0]!.rank).toBe(1)
  })

  it("prints the balance measurement for one-sided stories, runs them anyway", () => {
    const oneSided = cluster(["FOX News", "Washington Times"], ["right", "right"])
    const stories = selectStories(masthead, [oneSided])
    expect(stories).toHaveLength(1)
    expect(stories[0]!.balanceNote).toBe(
      "No source labeled center or left covered this story."
    )
  })

  it("gives fully covered stories no note", () => {
    const wide = cluster(["FOX News", "NPR", "BBC"], ["right", "left", "center"])
    expect(selectStories(masthead, [wide])[0]!.balanceNote).toBeNull()
  })

  it("caps the brief — it ends", () => {
    const many = Array.from({ length: STORY_CAP + 5 }, () =>
      cluster(["FOX News", "NPR"], ["right", "left"])
    )
    expect(selectStories(masthead, many)).toHaveLength(STORY_CAP)
  })
})

describe("dropAlreadyPrinted", () => {
  const links = (c: Cluster) => c.items.map((i) => i.link)

  it("sets aside a cluster whose members were mostly already printed", () => {
    const carryover = cluster(["FOX News", "NPR", "BBC"], ["right", "left", "center"])
    const printed = new Set(links(carryover).slice(0, 2)) // 2 of 3
    const { fresh, repeats } = dropAlreadyPrinted([carryover], printed)
    expect(repeats).toEqual([carryover])
    expect(fresh).toHaveLength(0)
  })

  it("keeps a cluster with mostly new reporting — a development runs again", () => {
    const developing = cluster(
      ["FOX News", "NPR", "BBC", "UPI"],
      ["right", "left", "center", "center"]
    )
    const printed = new Set(links(developing).slice(0, 1)) // 1 of 4
    const { fresh, repeats } = dropAlreadyPrinted([developing], printed)
    expect(fresh).toEqual([developing])
    expect(repeats).toHaveLength(0)
  })

  it("keeps an exact half-overlap — half new reporting is not a repeat", () => {
    const half = cluster(["FOX News", "NPR"], ["right", "left"])
    const printed = new Set(links(half).slice(0, 1)) // 1 of 2
    expect(dropAlreadyPrinted([half], printed).fresh).toEqual([half])
  })

  it("with an empty journal, every cluster is fresh", () => {
    const c = cluster(["FOX News", "NPR"], ["right", "left"])
    const { fresh, repeats } = dropAlreadyPrinted([c], new Set())
    expect(fresh).toEqual([c])
    expect(repeats).toHaveLength(0)
  })
})

describe("dropLowDensity", () => {
  it("sets aside a split survivor still below the floor (2026-07-31 blob)", () => {
    const blob = { ...cluster(["FOX News", "NPR", "BBC"], ["right", "left", "center"]), density: 0.33, wasSplit: true }
    const clean = cluster(["FOX News", "NPR"], ["right", "left"])
    const { printable, blobs } = dropLowDensity([blob, clean])
    expect(printable).toEqual([clean])
    expect(blobs).toEqual([blob])
  })

  it("a density exactly at the floor is printable", () => {
    const edge = { ...cluster(["FOX News", "NPR"], ["right", "left"]), density: 0.5 }
    expect(dropLowDensity([edge]).printable).toEqual([edge])
  })
})
