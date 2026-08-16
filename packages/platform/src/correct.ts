/**
 * The editor's correction pen (NORTH-STAR §9): mark a published story as
 * needing correction. The archive is never touched — the correction prints
 * in the NEXT edition, dated, pointing back at the original.
 *
 * Usage: npm run correct -- <edition-date> <story-rank> "what was wrong"
 *   e.g. npm run correct -- 2026-07-26 3 "The delegate count was 566 of 571, not 566 to 5."
 */
import { openJournal } from "./assemble.js"

const [edition, rankArg, ...noteParts] = process.argv.slice(2)
const rank = Number(rankArg)
const note = noteParts.join(" ").trim()

if (!edition || !/^\d{4}-\d{2}-\d{2}$/.test(edition) || !Number.isInteger(rank) || note.length < 10) {
  console.error('usage: npm run correct -- <YYYY-MM-DD> <story-rank> "correction text (in your words)"')
  process.exit(1)
}

const db = openJournal()
db.exec(`CREATE TABLE IF NOT EXISTS corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT, edition TEXT NOT NULL,
  story_rank INTEGER NOT NULL, note TEXT NOT NULL,
  created_at TEXT NOT NULL, printed_in TEXT
)`)

const story = db
  .prepare(
    `SELECT s.rank, d.headline FROM stories s
     LEFT JOIN drafts d ON d.cluster_hash = s.cluster_hash
     WHERE s.run_id = ? AND s.rank = ? AND s.status = 'published'
     GROUP BY s.cluster_hash`
  )
  .get(edition, rank) as { rank: number; headline: string | null } | undefined

if (!story) {
  console.error(`no published story #${rank} in the ${edition} edition`)
  process.exit(1)
}

db.prepare(
  "INSERT INTO corrections (edition, story_rank, note, created_at) VALUES (?, ?, ?, ?)"
).run(edition, rank, note, new Date().toISOString())

console.log(`correction recorded against ${edition} #${rank}: ${story.headline?.slice(0, 60)}`)
console.log("it will print at the top of the next edition, dated, pointing back.")
console.log("the original edition stays exactly as it was — that is the point.")
