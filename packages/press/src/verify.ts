/**
 * Stage 9: verify drafts against the fetched source texts. Deterministic
 * string work, no model — the cage around the compositor. Experiment 001:
 * the model's one failure class was attribution laundering, and every
 * instance was mechanically detectable.
 *
 * Violations (hard, trigger one revision then drop): quotes not found in
 * any account, sources line naming outlets we did not fetch or fewer than
 * two, word budget blown.
 * Advisories (recorded and reported, not enforced in v1): entities in
 * eto's voice that appear in no account, outlets fetched but not listed.
 */
import { SqlClient } from "@effect/sql"
import { Effect } from "effect"
import type { Account } from "./articles.js"
import type { Draft } from "./composite.js"

export interface Verification {
  readonly violations: ReadonlyArray<string>
  readonly advisories: ReadonlyArray<string>
}

const WORD_BUDGET = 350
const WORD_BUDGET_HARD = 420

const normalize = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()

const wordCount = (s: string): number => (s.match(/\S+/g) ?? []).length

/** Quote fragments >= this length must appear verbatim in some account. */
const QUOTE_MIN = 12

const ENTITY_STOP = new Set([
  "The", "This", "That", "These", "Those", "There", "They", "Their",
  "When", "Where", "What", "While", "With", "After", "Before", "Under",
  "Over", "From", "Into", "Both", "Some", "Also", "Sources", "Body",
  "Headline", "Where", "Accounts", "Differ", "Monday", "Tuesday",
  "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "January",
  "February", "March", "April", "June", "July", "August", "September",
  "October", "November", "December"
])

export const verifyDraft = (
  draft: Draft,
  accounts: ReadonlyArray<Account>
): Verification => {
  const violations: Array<string> = []
  const advisories: Array<string> = []

  const corpus = normalize(
    accounts.map((a) => `${a.item.title} ${a.text}`).join("\n")
  )
  const prose = `${draft.body}\n${draft.differ}`
  const proseNorm = normalize(prose)

  // 1. Every quoted span traces verbatim to some account.
  for (const m of proseNorm.matchAll(/"([^"]{4,400})"/g)) {
    const fragments = m[1]!
      .split(/\.{3}|…/)
      .map((f) => f.replace(/^[\s,.;:]+|[\s,.;:]+$/g, ""))
      .filter((f) => f.length >= QUOTE_MIN)
    for (const fragment of fragments) {
      if (!corpus.includes(fragment)) {
        violations.push(`quote not found in any account: "${fragment.slice(0, 60)}"`)
      }
    }
  }

  // 2. Sources line: >= 2 outlets, all of them actually fetched.
  const fetchedOutlets = [...new Set(accounts.map((a) => a.item.outlet))]
  const listed = draft.sourcesLine
    .split(/[-·,•|]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  const matchesFetched = (name: string): boolean =>
    fetchedOutlets.some(
      (o) =>
        normalize(o).includes(normalize(name)) ||
        normalize(name).includes(normalize(o))
    )
  if (listed.length < 2) {
    violations.push(`sources line lists ${listed.length} outlet(s); need >= 2`)
  }
  for (const name of listed) {
    if (!matchesFetched(name)) {
      violations.push(`sources line names an outlet we did not fetch: "${name}"`)
    }
  }
  for (const outlet of fetchedOutlets) {
    if (!listed.some((n) => matchesFetched(n) && normalize(n).includes(normalize(outlet)) || normalize(outlet).includes(normalize(n)))) {
      advisories.push(`fetched but not listed in sources: ${outlet}`)
    }
  }

  // 3. Word budget. Soft limit advises; hard limit violates.
  const words = wordCount(draft.headline) + wordCount(prose)
  if (words > WORD_BUDGET_HARD) {
    violations.push(`word budget blown: ${words} words (hard cap ${WORD_BUDGET_HARD})`)
  } else if (words > WORD_BUDGET) {
    advisories.push(`over word budget: ${words} words (target ${WORD_BUDGET})`)
  }

  // 4. Entities in eto's voice that no account contains (advisory in v1 —
  // enforcement waits until we've measured the false-positive rate).
  const entities = new Set(
    (prose.match(/\b[A-Z][a-z]{3,}\b/g) ?? []).filter((t) => !ENTITY_STOP.has(t))
  )
  for (const entity of entities) {
    if (!corpus.includes(entity.toLowerCase())) {
      advisories.push(`entity not found in any account: ${entity}`)
    }
  }

  return { violations, advisories }
}

export const editorNotes = (v: Verification): string =>
  v.violations.map((viol, i) => `${i + 1}. ${viol}`).join("\n")

export const persistVerifications = (
  clusterHash: string,
  attempt: number,
  v: Verification
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const now = new Date().toISOString()
    for (const [result, list] of [
      ["violation", v.violations],
      ["advisory", v.advisories]
    ] as const) {
      for (const detail of list) {
        yield* sql`INSERT INTO verifications ${sql.insert({
          cluster_hash: clusterHash,
          attempt,
          check: detail.split(":")[0] ?? detail,
          result,
          detail,
          verified_at: now
        })}`
      }
    }
    if (v.violations.length === 0 && v.advisories.length === 0) {
      yield* sql`INSERT INTO verifications ${sql.insert({
        cluster_hash: clusterHash,
        attempt,
        check: "all",
        result: "pass",
        detail: null,
        verified_at: now
      })}`
    }
  })
