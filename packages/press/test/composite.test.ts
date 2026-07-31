import { describe, expect, it } from "vitest"
import type { Account } from "../src/articles.js"
import { parseDraft, selectAccountsForPrompt, sourcesLineFor } from "../src/composite.js"

const good = `HEADLINE: Maine Democrats nominate Troy Jackson for U.S. Senate

BODY:
Maine Democrats on Saturday nominated Troy Jackson as their candidate.

He won 566 of 571 delegates at the convention in Bangor.

WHERE THE ACCOUNTS DIFFER:
FOX News emphasizes vetting concerns; NPR quotes supporters positively.

SOURCES: FOX News - NPR`

describe("parseDraft", () => {
  it("parses the four-part shape", () => {
    const d = parseDraft(good, 0)
    expect(d).not.toBeNull()
    expect(d!.headline).toBe("Maine Democrats nominate Troy Jackson for U.S. Senate")
    expect(d!.body).toContain("566 of 571")
    expect(d!.differ).toContain("FOX News emphasizes")
    expect(d!.sourcesLine).toBe("FOX News - NPR")
  })

  it("tolerates markdown bolding and heading marks on markers", () => {
    const bolded = good
      .replace("HEADLINE:", "## **HEADLINE:**")
      .replace("BODY:", "**BODY:**")
      .replace("WHERE THE ACCOUNTS DIFFER:", "**WHERE THE ACCOUNTS DIFFER:**")
      .replace("SOURCES:", "**SOURCES:**")
    const d = parseDraft(bolded, 1)
    expect(d).not.toBeNull()
    expect(d!.headline).toContain("Maine Democrats nominate")
  })

  it("rejects drafts missing a section", () => {
    expect(parseDraft(good.replace("WHERE THE ACCOUNTS DIFFER:", "DIFFERENCES:"), 0)).toBeNull()
  })

  it("rejects drafts that keep talking after SOURCES — it ends", () => {
    const chatty = good + "\n\nAlso of note, some analysts believe...\nAnd furthermore..."
    expect(parseDraft(chatty, 0)).toBeNull()
  })
})

describe("sourcesLineFor", () => {
  const account = (outlet: string, len: number): Account => ({
    item: {
      id: len,
      outlet,
      side: "center",
      kind: "news",
      title: `t${len}`,
      summary: "",
      link: `https://example.com/${outlet}/${len}`,
      publishedAt: new Date()
    },
    text: "x".repeat(len)
  })

  it("lists exactly the prompt accounts' outlets, deduplicated, in prompt order", () => {
    const accounts = [account("NPR", 100), account("BBC", 300), account("NPR", 200)]
    const prompt = selectAccountsForPrompt(accounts)
    expect(sourcesLineFor(prompt)).toBe("NPR - BBC")
  })

  it("never lists an outlet whose account was cut by the prompt cap", () => {
    const accounts = [
      account("A", 700), account("B", 600), account("C", 500), account("D", 400),
      account("E", 300), account("F", 200), account("G", 100)
    ]
    const prompt = selectAccountsForPrompt(accounts)
    expect(prompt).toHaveLength(6)
    expect(sourcesLineFor(prompt)).not.toContain("G")
  })
})
