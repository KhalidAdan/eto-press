/**
 * Export the journal's genuinely-ours tables as JSONL into db/exports/ —
 * the git-friendly resilience layer. These are the tables PIPELINE.md
 * calls irreplaceable (editorial acts and operational history), exported
 * as diffable text. The big tables (items, articles, verdicts, drafts)
 * stay out: they are rebuildable caches, they bloat git history, and
 * articles carries other outlets' full text, which we do not redistribute.
 * Run: npx tsx src/export-journal.ts  (the paperboy runs it before push)
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { openJournal } from "./assemble.js"

const db = openJournal()
mkdirSync("db/exports", { recursive: true })

const EXPORTS: Record<string, string> = {
  stories: "SELECT * FROM stories ORDER BY run_id, rank",
  feed_fetches: "SELECT * FROM feed_fetches ORDER BY fetched_at",
  email_sends: "SELECT * FROM email_sends ORDER BY run_id",
  clusters: "SELECT * FROM clusters ORDER BY run_id, cluster_hash",
  corrections: "SELECT * FROM corrections ORDER BY id"
}

for (const [table, query] of Object.entries(EXPORTS)) {
  try {
    const rows = db.prepare(query).all()
    writeFileSync(
      `db/exports/${table}.jsonl`,
      rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""),
      "utf8"
    )
    console.log(`exported ${table}: ${rows.length} rows`)
  } catch (e) {
    console.log(`skipped ${table}: ${(e as Error).message.split("\n")[0]}`)
  }
}
