/**
 * Known-answer probes for the verifier, built from experiment 001's actual
 * defects: a laundered quote, a sources line naming an unfetched outlet.
 */
import { describe, expect, it } from "vitest"
import type { Account } from "../src/articles.js"
import type { Draft } from "../src/composite.js"
import { verifyDraft } from "../src/verify.js"

const account = (outlet: string, text: string): Account => ({
  item: {
    id: 1,
    outlet,
    side: "test",
    kind: "news",
    title: `${outlet} headline`,
    summary: "",
    link: `https://example.com/${outlet}`,
    publishedAt: new Date()
  },
  text
})

const accounts = [
  account(
    "FOX News",
    `Jackson said "I do believe I've been vetted, I've been tested" when asked about concerns. A strategist called it "a bit of a rocket vetting process" this week.`
  ),
  account("NPR", "Jackson won 566 of 571 delegates at the convention in Bangor.")
]

const draft = (over: Partial<Draft>): Draft => ({
  headline: "Jackson nominated",
  body: `Jackson won 566 of 571 delegates. He said "I do believe I've been vetted, I've been tested."`,
  differ: "FOX News emphasizes vetting concerns; NPR does not.",
  sourcesLine: "FOX News - NPR",
  raw: "",
  attempt: 0,
  ...over
})

describe("verifyDraft", () => {
  it("flags prose that refers to accounts by number (2026-08-01 Ceuta leak)", () => {
    const v = verifyDraft(
      draft({
        differ:
          "FOX News and ACCOUNT 3 claim 60,000 migrants entered, while ACCOUNT 2 reports 50,000."
      }),
      accounts
    )
    expect(v.violations).toContain(
      "prose refers to accounts by number instead of outlet name"
    )
  })

  it("does not flag ordinary plural 'accounts' near numbers", () => {
    const v = verifyDraft(
      draft({
        body: `Jackson won 566 of 571 delegates. He said "I do believe I've been vetted, I've been tested." NPR reports retirement accounts hold 401(k) assets.`
      }),
      accounts
    )
    expect(
      v.violations.filter((x) => x.includes("accounts by number"))
    ).toEqual([])
  })

  it("passes a clean draft", () => {
    const v = verifyDraft(draft({}), accounts)
    expect(v.violations).toEqual([])
  })

  it("flags a quote that appears in no account", () => {
    const v = verifyDraft(
      draft({ body: `He said "this whole process was completely rigged from the start."` }),
      accounts
    )
    expect(v.violations.some((x) => x.startsWith("quote not found"))).toBe(true)
  })

  it("flags a sources line naming an unfetched outlet", () => {
    const v = verifyDraft(draft({ sourcesLine: "FOX News - NPR - Reuters" }), accounts)
    expect(v.violations.some((x) => x.includes("Reuters"))).toBe(true)
  })

  it("flags a one-outlet sources line", () => {
    const v = verifyDraft(draft({ sourcesLine: "FOX News" }), accounts)
    expect(v.violations.some((x) => x.includes("need >= 2"))).toBe(true)
  })

  it("blows the whistle on a blown word budget", () => {
    const v = verifyDraft(draft({ body: "word ".repeat(500) }), accounts)
    expect(v.violations.some((x) => x.startsWith("word budget"))).toBe(true)
  })

  it("advises (not violates) on unknown entities in eto's voice", () => {
    const v = verifyDraft(
      draft({ differ: "FOX News emphasizes concerns; Bloomberg does not." }),
      accounts
    )
    expect(v.violations.some((x) => x.includes("Bloomberg"))).toBe(false)
    expect(v.advisories.some((x) => x.includes("Bloomberg"))).toBe(true)
  })
})
