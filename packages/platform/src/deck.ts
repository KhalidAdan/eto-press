/**
 * The deck, and its cage (generation 3).
 *
 * A deck is the one- or two-sentence line under a headline: written by
 * the copy desk, not the author, and its whole discipline is that it
 * adds nothing the piece did not say. Two rules decide where a deck comes
 * from, in this order:
 *
 *   1. The outlet's own blurb wins. A feed item whose summary is short
 *      enough to be a deck IS the deck, credited as the outlet's. No
 *      model is asked anything.
 *   2. Otherwise the desk asks the inference boundary the deck question
 *      about the piece's text and runs the answer through the cage: at
 *      most two sentences, and no number, no capitalized name, no quoted
 *      phrase that the piece does not contain. A refused deck is
 *      journaled as refused and never re-asked for the same question;
 *      the row prints with no deck rather than with a guess (NORTH-STAR
 *      §1: nothing unattributed ships; the brief's §5: incomplete beats
 *      wrong).
 *
 * The cage is pure and exported so the lab can grade candidates by the
 * rule production applies.
 */
import { SqlClient } from "@effect/sql"
import { Effect } from "effect"
import { Inference, type DeckSource } from "./inference.js"

/** A blurb longer than this is a paragraph, not a deck. */
export const OUTLET_DECK_CAP = 240
/** A deck longer than this is a paragraph, whoever wrote it. */
export const DECK_WORDS_MAX = 40

export const splitSentences = (text: string): Array<string> =>
  text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+(?=[^a-z])/)
    .map((s) => s.trim())
    .filter(Boolean)

const norm = (s: string): string => s.toLowerCase().replace(/[’']/g, "'")

/** Numbers as they would be written: 4.11, 1,200, 2026, 40%. */
const numbers = (s: string): Array<string> =>
  (s.match(/\d[\d,.]*%?/g) ?? []).map((n) => n.replace(/[,.]$/, ""))

/** Capitalized words that are not at a sentence start — the names. */
const names = (deck: string): Array<string> => {
  const out: Array<string> = []
  for (const sentence of splitSentences(deck)) {
    const words = sentence.split(/\s+/)
    for (const [i, w] of words.entries()) {
      const bare = w.replace(/^[("'“‘]+|[)"'”’.,;:!?]+$/g, "")
      if (i === 0) continue
      if (/^[A-Z][A-Za-z'’-]+$/.test(bare) && bare.length > 1) out.push(bare)
    }
  }
  return out
}

/** Quoted phrases of three words or more. */
const quotes = (deck: string): Array<string> =>
  [...deck.matchAll(/["“]([^"”]{3,})["”]/g)]
    .map((m) => m[1]!.trim())
    .filter((q) => q.split(/\s+/).length >= 3)

export type CageVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string }

/** Does this deck say only what the text says? Cheap, deterministic,
 * conservative: a deck that fails here is not printed, and the text is
 * the only witness. */
export const deckPasses = (deck: string, text: string): CageVerdict => {
  const sentences = splitSentences(deck)
  if (sentences.length === 0) return { ok: false, reason: "empty" }
  if (sentences.length > 2) return { ok: false, reason: `${sentences.length} sentences` }
  const words = deck.trim().split(/\s+/).length
  if (words > DECK_WORDS_MAX) return { ok: false, reason: `${words} words` }
  const haystack = norm(text)
  for (const n of numbers(deck)) {
    if (!haystack.includes(norm(n))) return { ok: false, reason: `number not in the piece: ${n}` }
  }
  for (const name of names(deck)) {
    // A name passes on its stem too: "Macs" when the piece says "Mac",
    // "Apple's" when it says "Apple" (learned from the first live run).
    const stems = [name, name.replace(/[’']s$/, ""), name.replace(/s$/, "")]
    if (!stems.some((s) => s.length > 1 && haystack.includes(norm(s)))) {
      return { ok: false, reason: `name not in the piece: ${name}` }
    }
  }
  for (const q of quotes(deck)) {
    if (!haystack.includes(norm(q))) return { ok: false, reason: `quote not in the piece: "${q}"` }
  }
  return { ok: true }
}

/** The outlet's own deck, when its blurb is deck-sized. */
export const outletDeck = (summary: string): string | null => {
  const flat = summary.replace(/\s+/g, " ").trim()
  if (flat === "") return null
  if (flat.length > OUTLET_DECK_CAP) return null
  return flat
}

export interface DeckResult {
  readonly deck: string | null
  /** Who wrote it: the outlet's feed, the desk (a model, caged), or
   * nobody — the piece prints with its headline alone. */
  readonly by: "outlet" | "desk" | "nobody"
  /** Why the desk's deck was refused, when it was. */
  readonly refused?: string | undefined
}

/** The deck for one piece: the outlet's blurb if it has one, else the
 * desk's, asked once per (link, model, question) and journaled — a rerun
 * never asks twice, and a refusal is remembered as a refusal. `text` is
 * the piece's full text when the desk has it (null: nothing to ask
 * about). */
export const deckFor = (
  piece: DeckSource & { readonly link: string; readonly summary: string },
  text: string | null
) =>
  Effect.gen(function* () {
    const own = outletDeck(piece.summary)
    if (own !== null) return { deck: own, by: "outlet" } satisfies DeckResult
    if (text === null || text.trim() === "") return { deck: null, by: "nobody" } satisfies DeckResult

    const sql = yield* SqlClient.SqlClient
    const inference = yield* Inference
    const { model, questionHash } = inference.identities.deck
    const cached = yield* sql<{ deck: string | null; verdict: string; detail: string | null }>`
      SELECT deck, verdict, detail FROM decks
      WHERE link = ${piece.link} AND model = ${model} AND question_hash = ${questionHash}
    `
    if (cached.length > 0) {
      const row = cached[0]!
      return row.deck === null
        ? ({ deck: null, by: "nobody", refused: row.detail ?? row.verdict } satisfies DeckResult)
        : ({ deck: row.deck, by: "desk" } satisfies DeckResult)
    }

    const answer = yield* inference.deck({ outlet: piece.outlet, title: piece.title, text }, piece.link)
    const verdict: { verdict: string; detail: string | null; deck: string | null } =
      answer.deck === null
        ? { verdict: "unparseable", detail: null, deck: null }
        : (() => {
            const cage = deckPasses(answer.deck, `${piece.title}\n${text}`)
            return cage.ok
              ? { verdict: "pass", detail: null, deck: answer.deck }
              : { verdict: "refused", detail: cage.reason, deck: null }
          })()
    yield* sql`INSERT OR REPLACE INTO decks ${sql.insert({
      link: piece.link,
      model,
      question_hash: questionHash,
      deck: verdict.deck,
      raw: answer.raw,
      verdict: verdict.verdict,
      detail: verdict.detail,
      created_at: new Date().toISOString()
    })}`
    if (verdict.deck === null) {
      yield* Effect.logInfo(
        `  deck refused (${verdict.detail ?? verdict.verdict}): ${piece.title.slice(0, 60)}`
      )
      return { deck: null, by: "nobody", refused: verdict.detail ?? verdict.verdict } satisfies DeckResult
    }
    return { deck: verdict.deck, by: "desk" } satisfies DeckResult
  }).pipe(Effect.withSpan("deck.deckFor", { attributes: { link: piece.link } }))
