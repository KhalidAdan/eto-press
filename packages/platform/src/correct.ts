/**
 * The editor's correction pen (NORTH-STAR §9): mark a published story as
 * needing correction. The archive is never touched — the correction prints
 * in the NEXT edition, dated, pointing back at the original.
 *
 * Usage: eto correct <edition-date> <position> "what was wrong"
 *   e.g. eto correct 2026-07-26 3 "The delegate count was 566 of 571, not 566 to 5."
 *
 * The position is the story's paper-global print order — #3 on the page,
 * whichever section it printed in (generation 3 keeps positions global
 * across sections for exactly this reason). The published-edition store
 * names the story; the legacy engine-table lookup covers editions from
 * before the store existed.
 */
import { openJournal } from "./assemble.js"
import { rowSection } from "./published.js"

const [edition, rankArg, ...noteParts] = process.argv.slice(2)
const rank = Number(rankArg)
const note = noteParts.join(" ").trim()

if (!edition || !/^\d{4}-\d{2}-\d{2}$/.test(edition) || !Number.isInteger(rank) || note.length < 10) {
  console.error('usage: eto correct <YYYY-MM-DD> <position> "correction text (in your words)"')
  process.exit(1)
}

const db = openJournal()

const stored = db
  .prepare(
    `SELECT headline, section FROM published_stories WHERE run_id = ? AND position = ?`
  )
  .get(edition, rank) as { headline: string; section?: string | null } | undefined

const legacy =
  stored !== undefined
    ? undefined
    : (db
        .prepare(
          `SELECT s.rank, d.headline FROM stories s
           LEFT JOIN drafts d ON d.cluster_hash = s.cluster_hash
           WHERE s.run_id = ? AND s.rank = ? AND s.status = 'published'
           GROUP BY s.cluster_hash`
        )
        .get(edition, rank) as { rank: number; headline: string | null } | undefined)

if (stored === undefined && legacy === undefined) {
  console.error(`no published story #${rank} in the ${edition} edition`)
  process.exit(1)
}

const headline = stored?.headline ?? legacy?.headline ?? null
const section = stored === undefined ? null : rowSection(stored)

db.prepare(
  "INSERT INTO corrections (edition, story_rank, section, note, created_at) VALUES (?, ?, ?, ?, ?)"
).run(edition, rank, section, note, new Date().toISOString())

console.log(
  `correction recorded against ${edition} #${rank}${section === null ? "" : ` (${section})`}: ${headline?.slice(0, 60)}`
)
console.log("it will print at the top of the next edition, dated, pointing back.")
console.log("the original edition stays exactly as it was — that is the point.")
