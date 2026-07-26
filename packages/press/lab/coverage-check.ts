/** Ad-hoc: is the "no source labeled X covered this" note honest?
 * Counts window items per outlet and greps right-side titles for the
 * stories that got flagged. Run: npx tsx lab/coverage-check.ts */
import Database from "better-sqlite3"

const db = new Database("db/eto.sqlite")

console.log("--- items by outlet (whole journal):")
for (const r of db
  .prepare("SELECT outlet, side, count(*) AS n FROM items GROUP BY outlet ORDER BY n DESC")
  .all() as Array<{ outlet: string; side: string; n: number }>) {
  console.log(`  ${r.side.padEnd(7)} ${r.outlet.padEnd(18)} ${r.n}`)
}

const grep = (label: string, like: Array<string>) => {
  console.log(`--- right-side items matching ${label}:`)
  const where = like.map(() => "title LIKE ?").join(" OR ")
  const rows = db
    .prepare(`SELECT outlet, title FROM items WHERE side = 'right' AND (${where})`)
    .all(...like) as Array<{ outlet: string; title: string }>
  if (rows.length === 0) console.log("  (none)")
  for (const r of rows) console.log(`  ${r.outlet} | ${r.title.slice(0, 75)}`)
}

grep("wildfires", ["%fire%", "%blaze%", "%evacuat%"])
grep("India protests", ["%India%", "%protest%", "%Cockroach%"])
grep("Iran/Houthis", ["%Iran%", "%Houthi%", "%Saudi%"])
