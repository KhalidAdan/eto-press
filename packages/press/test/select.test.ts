import { describe, expect, it } from "vitest"
import type { Cluster } from "../src/cluster.js"
import type { Masthead } from "../src/masthead.js"
import { selectStories, STORY_CAP } from "../src/select.js"

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
