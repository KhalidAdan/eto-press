/**
 * Known-answer probes for the density gate. The bridge fixture is a
 * miniature of experiment 002's India blob: two dense event-cores welded
 * by a single chained yes-edge that no triangle supports.
 */
import { describe, expect, it } from "vitest"
import { buildClusters, DENSITY_MIN } from "../src/cluster.js"
import type { JudgedPair } from "../src/judge.js"
import type { Item } from "../src/normalize.js"

let nextId = 1
const item = (outlet: string, title: string): Item => ({
  id: nextId++,
  outlet,
  side: "test",
  kind: "news",
  title,
  summary: "",
  link: `https://example.com/${nextId}`,
  publishedAt: new Date("2026-07-25T12:00:00Z")
})

const judged = (a: Item, b: Item, same: boolean): JudgedPair => ({
  pair: { a, b, shared: [] },
  same,
  cached: false
})

describe("buildClusters", () => {
  it("keeps a dense triangle intact", () => {
    const a = item("FOX News", "resignation A")
    const b = item("NPR", "resignation B")
    const c = item("BBC", "resignation C")
    const clusters = buildClusters([
      judged(a, b, true),
      judged(b, c, true),
      judged(a, c, true)
    ])
    expect(clusters).toHaveLength(1)
    expect(clusters[0]!.items).toHaveLength(3)
    expect(clusters[0]!.density).toBe(1)
    expect(clusters[0]!.wasSplit).toBe(false)
  })

  it("splits two event-cores welded by an unsupported bridge", () => {
    const a = item("FOX News", "minister resigns A")
    const b = item("NPR", "minister resigns B")
    const c = item("BBC", "minister resigns C")
    const d = item("Guardian", "pellet gun videos D")
    const e = item("Al Jazeera", "pellet gun videos E")
    const f = item("The Hill", "pellet gun videos F")
    const clusters = buildClusters([
      // core 1: dense
      judged(a, b, true),
      judged(b, c, true),
      judged(a, c, true),
      // core 2: dense
      judged(d, e, true),
      judged(e, f, true),
      judged(d, f, true),
      // the glue: one chained yes with no triangle support
      judged(c, d, true),
      // and the no-verdicts that reveal the blob for what it is
      judged(a, d, false),
      judged(a, e, false),
      judged(a, f, false),
      judged(b, d, false),
      judged(b, e, false),
      judged(b, f, false),
      judged(c, e, false),
      judged(c, f, false)
    ])
    expect(clusters).toHaveLength(2)
    for (const c of clusters) {
      expect(c.items).toHaveLength(3)
      expect(c.wasSplit).toBe(true)
      expect(c.density).toBe(1)
    }
  })

  it("leaves an ambiguous open chain of three alone (density above gate)", () => {
    const a = item("FOX News", "story A")
    const b = item("NPR", "story B")
    const c = item("BBC", "story C")
    const clusters = buildClusters([
      judged(a, b, true),
      judged(b, c, true),
      judged(a, c, false) // 2/3 yes = 0.67, above the gate: benefit of doubt
    ])
    expect(2 / 3).toBeGreaterThan(DENSITY_MIN)
    expect(clusters).toHaveLength(1)
    expect(clusters[0]!.items).toHaveLength(3)
  })

  it("drops single-outlet groups and isolated pairs judged no", () => {
    const a = item("FOX News", "story A")
    const b = item("NPR", "story B")
    const clusters = buildClusters([judged(a, b, false)])
    expect(clusters).toHaveLength(0)
  })

  it("reports outlets and sides sorted and deduplicated", () => {
    const a = item("FOX News", "A")
    const b = item("NPR", "B")
    const c = { ...item("FOX News", "C"), side: "right" }
    const clusters = buildClusters([
      judged(a, b, true),
      judged(b, c, true),
      judged(a, c, true)
    ])
    expect(clusters[0]!.outlets).toEqual(["FOX News", "NPR"])
    expect(clusters[0]!.sides).toEqual(["right", "test"])
  })
})
