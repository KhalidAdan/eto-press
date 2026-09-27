/**
 * Audit the deck question against a paper's journal: every deck the desk
 * was asked for, the cage's ruling, and the deck itself beside the
 * writer's title — so the editor can grade by eye what the cage graded by
 * rule (NORTH-STAR §1: nothing unattributed ships; the deck adds nothing).
 *
 * Run in a paper: npx tsx node_modules/@eto-press/press/lab/deck-audit.ts
 * (or from the monorepo, with cwd set to a paper directory).
 */
import Database from "better-sqlite3"
import { existsSync } from "node:fs"

if (!existsSync("db/eto.sqlite")) {
  console.error("no db/eto.sqlite here — run this in a paper that has printed")
  process.exit(1)
}
const db = new Database("db/eto.sqlite", { readonly: true })

const rows = db
  .prepare(
    `SELECT d.link, d.model, d.verdict, d.detail, d.deck, d.raw, d.created_at,
            i.outlet, i.title, i.summary
     FROM decks d LEFT JOIN items i ON i.link = d.link
     ORDER BY d.created_at DESC`
  )
  .all() as Array<{
  link: string
  model: string
  verdict: string
  detail: string | null
  deck: string | null
  raw: string
  created_at: string
  outlet: string | null
  title: string | null
  summary: string | null
}>

if (rows.length === 0) {
  console.log("the desk has asked for no decks yet (every post carried its own blurb, or the shelf has not printed)")
  process.exit(0)
}

const counts = new Map<string, number>()
for (const r of rows) counts.set(r.verdict, (counts.get(r.verdict) ?? 0) + 1)
console.log(`decks asked: ${rows.length} — ${[...counts.entries()].map(([v, n]) => `${v} ${n}`).join(", ")}\n`)

for (const r of rows) {
  console.log(`${r.verdict.toUpperCase().padEnd(11)} ${r.outlet ?? "?"} — ${r.title ?? r.link}`)
  if (r.deck !== null) console.log(`   deck: ${r.deck}`)
  else console.log(`   raw:  ${r.raw.replace(/\s+/g, " ").slice(0, 200)}${r.detail ? `\n   why:  ${r.detail}` : ""}`)
  console.log(`   ${r.link}\n`)
}

const refused = rows.filter((r) => r.verdict !== "pass").length
console.log(
  `${rows.length - refused}/${rows.length} passed the cage. A refusal is the cage doing its job — ` +
    "read the raw line above it and decide whether the model invented or the cage was strict."
)
