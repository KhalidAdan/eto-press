/**
 * The deck's cage (generation 3): a deck may say only what the piece
 * says. Planted fabrications — a number, a name, a quote the piece does
 * not contain — must be refused; a faithful deck must pass. And the
 * provider's parser must hand the cage a clean line.
 */
import { describe, expect, it } from "vitest"
import { deckPasses, outletDeck, OUTLET_DECK_CAP, splitSentences } from "../src/deck.js"
import { DECK_PROMPT_HASH, deckPrompt, parseDeck } from "../src/inference-ollama.js"

const piece =
  "The Fed held its benchmark rate at 4.25 percent on Wednesday. Two members " +
  "dissented, and the statement dropped the word \"patient\" for the first time " +
  "since March. Chair Waller said the committee would \"proceed carefully\". " +
  "Markets barely moved."

describe("splitSentences", () => {
  it("splits on terminal punctuation followed by a capital, not on decimals", () => {
    expect(splitSentences("Rates held at 4.25 percent. Two dissented! Markets shrugged?")).toEqual([
      "Rates held at 4.25 percent.",
      "Two dissented!",
      "Markets shrugged?"
    ])
  })
})

describe("deckPasses", () => {
  it("passes a faithful deck", () => {
    expect(deckPasses("The Fed holds at 4.25 percent; two members dissented.", piece)).toEqual({ ok: true })
  })

  it("passes sentence-initial capitals and names the piece contains", () => {
    expect(deckPasses("Waller says the committee will proceed carefully. Markets barely moved.", piece).ok).toBe(true)
  })

  it("passes a name on its stem: plural or possessive of a name the piece has", () => {
    expect(deckPasses("Two Feds and the Fed's chair: Waller's committee held.", piece).ok).toBe(true)
  })

  it("refuses a planted number", () => {
    const v = deckPasses("The Fed holds at 4.5 percent; two members dissented.", piece)
    expect(v.ok).toBe(false)
    expect((v as { reason: string }).reason).toMatch(/number/)
  })

  it("refuses a planted name", () => {
    const v = deckPasses("The Fed holds; Powell says the committee will proceed carefully.", piece)
    expect(v.ok).toBe(false)
    expect((v as { reason: string }).reason).toMatch(/name.*Powell/)
  })

  it("refuses a planted quote", () => {
    const v = deckPasses('The Fed holds, promising to "act with great urgency" on inflation.', piece)
    expect(v.ok).toBe(false)
    expect((v as { reason: string }).reason).toMatch(/quote/)
  })

  it("refuses a third sentence and a runaway length", () => {
    expect(deckPasses("One. Two. Three.", piece).ok).toBe(false)
    expect(deckPasses(("held ").repeat(45).trim() + ".", piece).ok).toBe(false)
  })

  it("refuses nothing", () => {
    expect(deckPasses("   ", piece).ok).toBe(false)
  })
})

describe("outletDeck", () => {
  it("is the feed's blurb when it is deck-sized, else null", () => {
    expect(outletDeck("  A short  blurb.\n")).toBe("A short blurb.")
    expect(outletDeck("")).toBeNull()
    expect(outletDeck("word ".repeat(OUTLET_DECK_CAP))).toBeNull()
  })
})

describe("parseDeck (the provider's parser)", () => {
  it("strips thinking, labels, bold and wrapping quotes", () => {
    expect(parseDeck('<think>hmm</think>\n**Deck:** "The Fed holds at 4.25 percent."')).toBe(
      "The Fed holds at 4.25 percent."
    )
  })
  it("returns null for nothing usable", () => {
    expect(parseDeck("ok")).toBeNull()
  })
  it("has a stable question identity and names the writer in the prompt", () => {
    expect(DECK_PROMPT_HASH).toHaveLength(16)
    const prompt = deckPrompt({ outlet: "A Writer", title: "T", text: "body" })
    expect(prompt).toContain("by A Writer")
    expect(prompt).toContain("HEADLINE: T")
  })
})
