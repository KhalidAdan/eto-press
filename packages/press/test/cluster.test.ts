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

  it("shears bridges that DO have triangle support by escalating the bar (2026-07-31 Iran blob)", () => {
    // Two 5-cliques bridged by two yes-edges that support each other's
    // triangle: at support 1 nothing cuts (the old failure), at support 2
    // the bridges shear while in-clique edges (3 common neighbors) survive.
    const A = ["FOX News", "NPR", "BBC", "UPI", "The Hill"].map((o) => item(o, `strikes ${o}`))
    const B = ["Guardian", "Al Jazeera", "CBS News", "Slate", "Newsweek"].map((o) => item(o, `coalition ${o}`))
    const pairs: Array<JudgedPair> = []
    for (const clique of [A, B]) {
      for (let i = 0; i < clique.length; i++) {
        for (let j = i + 1; j < clique.length; j++) {
          pairs.push(judged(clique[i]!, clique[j]!, true))
        }
      }
    }
    for (const x of A) {
      for (const y of B) {
        const isBridge = (x === A[3] || x === A[4]) && y === B[0]
        pairs.push(judged(x, y, isBridge))
      }
    }
    // 22 yes of 45 judged = 0.489: under the gate, and fully welded at support 1.
    const clusters = buildClusters(pairs)
    expect(clusters).toHaveLength(2)
    for (const c of clusters) {
      expect(c.items).toHaveLength(5)
      expect(c.wasSplit).toBe(true)
      expect(c.density).toBe(1)
    }
  })

  it("keeps an unshearable blob intact for stage 5c to refuse, as measured", () => {
    // A hub judged same-event with everything, spokes judged no with each
    // other: every yes-edge is hub-adjacent, no triangles exist at all, so
    // no support level ever cuts anything. The blob must survive with its
    // low density visible, not vanish.
    const hub = item("Straight Arrow News", "digest that matches everything")
    const spokes = ["FOX News", "NPR", "BBC", "Guardian"].map((o) => item(o, `story ${o}`))
    const pairs: Array<JudgedPair> = spokes.map((s) => judged(hub, s, true))
    for (let i = 0; i < spokes.length; i++) {
      for (let j = i + 1; j < spokes.length; j++) {
        pairs.push(judged(spokes[i]!, spokes[j]!, false))
      }
    }
    const clusters = buildClusters(pairs)
    expect(clusters).toHaveLength(1)
    expect(clusters[0]!.items).toHaveLength(5)
    expect(clusters[0]!.density).toBeCloseTo(4 / 10)
    expect(clusters[0]!.density).toBeLessThan(DENSITY_MIN)
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
