/**
 * Known-answer probes for the lexical prefilter, using the experiment 001/002
 * story: the FOX and NPR accounts of the Maine nomination must survive the
 * prefilter; unrelated pairs and same-outlet pairs must not reach the model.
 */
import { describe, expect, it } from "vitest"
import type { Item } from "../src/normalize.js"
import { candidatePairs, capTokens } from "../src/prefilter.js"

let nextId = 1
const item = (outlet: string, title: string, summary = ""): Item => ({
  id: nextId++,
  outlet,
  side: "test",
  kind: "news",
  title,
  summary,
  link: `https://example.com/${nextId}`,
  publishedAt: new Date("2026-07-25T12:00:00Z")
})

const maineFox = item(
  "FOX News",
  "Maine Democrats crown Troy Jackson as Platner replacement as fresh scrutiny clouds Senate reset"
)
const maineNpr = item(
  "NPR",
  "Democrats in Maine formally nominate Troy Jackson as their new candidate for U.S. Senate"
)
const vegasBuffet = item(
  "FOX News",
  "Bargain buffet refuses to die while luxury dining takes over Vegas"
)
const wildfires = item(
  "BBC",
  "More than 250,000 flee wildfires in France and Spain"
)

describe("capTokens", () => {
  it("keeps proper nouns, drops stopwords", () => {
    const toks = capTokens(maineNpr)
    expect(toks).toContain("Maine")
    expect(toks).toContain("Troy")
    expect(toks).toContain("Jackson")
    expect(toks).not.toContain("The")
    expect(toks).not.toContain("What")
  })
})

describe("candidatePairs", () => {
  it("passes the Maine pair to the model", () => {
    const pairs = candidatePairs([maineFox, maineNpr, vegasBuffet, wildfires])
    const match = pairs.find(
      (p) =>
        (p.a === maineFox && p.b === maineNpr) ||
        (p.a === maineNpr && p.b === maineFox)
    )
    expect(match).toBeDefined()
    expect(match!.shared).toContain("Jackson")
  })

  it("never pairs items from the same outlet", () => {
    const pairs = candidatePairs([maineFox, vegasBuffet, maineNpr])
    expect(
      pairs.some((p) => p.a.outlet === p.b.outlet)
    ).toBe(false)
  })

  it("filters unrelated cross-outlet pairs", () => {
    const pairs = candidatePairs([vegasBuffet, wildfires])
    expect(pairs).toHaveLength(0)
  })
})
