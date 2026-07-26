/**
 * Stage 3: window + lexical prefilter. Deterministic, recomputed each run.
 * A pair of cross-outlet news items survives only if the two share >= 2
 * capitalized tokens, or 1 that is rare across this run's corpus.
 * (Experiment 002: 20,413 cross-outlet pairs -> 539 model questions.)
 */
import type { Item } from "./normalize.js"

const CAP_TOKEN = /\b[A-Z][a-zA-Z]+\b/g

const CAP_STOPWORDS = new Set([
  "The", "A", "An", "In", "On", "At", "To", "For", "Of", "And", "But",
  "Or", "As", "Is", "Are", "It", "Its", "He", "She", "They", "His",
  "Her", "Their", "This", "That", "These", "Those", "What", "Who",
  "How", "Why", "When", "Where", "With", "After", "Before", "Over",
  "Under", "Amid", "Says", "Say", "Said", "News", "Report", "Live",
  "Watch", "Video", "Opinion", "Exclusive", "Breaking", "Update"
])

export const RARE_FREQ = 4

export const capTokens = (item: Pick<Item, "title" | "summary">): Set<string> => {
  const found = `${item.title} ${item.summary}`.match(CAP_TOKEN) ?? []
  return new Set(found.filter((t) => !CAP_STOPWORDS.has(t)))
}

export interface CandidatePair {
  readonly a: Item
  readonly b: Item
  readonly shared: ReadonlyArray<string>
}

export const candidatePairs = (
  items: ReadonlyArray<Item>
): ReadonlyArray<CandidatePair> => {
  const tokens = new Map(items.map((it) => [it, capTokens(it)]))
  const freq = new Map<string, number>()
  for (const toks of tokens.values()) {
    for (const t of toks) freq.set(t, (freq.get(t) ?? 0) + 1)
  }

  const pairs: Array<CandidatePair> = []
  for (let i = 0; i < items.length; i++) {
    const a = items[i]!
    const aToks = tokens.get(a)!
    for (let j = i + 1; j < items.length; j++) {
      const b = items[j]!
      if (a.outlet === b.outlet) continue
      const shared = [...tokens.get(b)!].filter((t) => aToks.has(t))
      if (
        shared.length >= 2 ||
        shared.some((t) => (freq.get(t) ?? 0) <= RARE_FREQ)
      ) {
        pairs.push({ a, b, shared })
      }
    }
  }
  return pairs
}

/** Total cross-outlet pair count, for the funnel report and tripwire. */
export const crossOutletPairCount = (items: ReadonlyArray<Item>): number => {
  let n = 0
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (items[i]!.outlet !== items[j]!.outlet) n++
    }
  }
  return n
}
