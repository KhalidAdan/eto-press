/** One-off: capture og:image for already-journaled articles of published
 * stories (fetched before extraction learned to keep it).
 * Run: npx tsx lab/backfill-og.ts */
import Database from "better-sqlite3"
import { JSDOM, VirtualConsole } from "jsdom"

const UA = "eto/0.1 (+local news compositor; front-door reader)"
const db = new Database("db/eto.sqlite")

// The pipeline's ensureSchema owns migrations, but this script may run first.
try {
  db.exec("ALTER TABLE articles ADD COLUMN og_image TEXT")
} catch {
  /* already applied */
}

const rows = db
  .prepare(
    `SELECT DISTINCT i.id, i.outlet, i.link FROM cluster_items ci
     JOIN stories s ON s.run_id = ci.run_id AND s.cluster_hash = ci.cluster_hash
     JOIN items i ON i.id = ci.item_id
     JOIN articles a ON a.item_id = i.id AND a.status = 'ok'
     WHERE s.status = 'published' AND a.og_image IS NULL`
  )
  .all() as Array<{ id: number; outlet: string; link: string }>

console.log(`${rows.length} articles need og:image`)
let found = 0
for (const row of rows) {
  try {
    const res = await fetch(row.link, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(20_000),
      redirect: "follow"
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const vc = new VirtualConsole()
    vc.on("jsdomError", () => {})
    const dom = new JSDOM(await res.text(), { virtualConsole: vc })
    const og = dom.window.document
      .querySelector('meta[property="og:image"], meta[name="twitter:image"]')
      ?.getAttribute("content")
      ?.trim()
    if (og?.startsWith("http")) {
      db.prepare("UPDATE articles SET og_image = ? WHERE item_id = ?").run(og, row.id)
      found++
      console.log(`  ok    ${row.outlet}`)
    } else {
      console.log(`  none  ${row.outlet}`)
    }
  } catch (e) {
    console.log(`  fail  ${row.outlet} (${String(e).slice(0, 40)})`)
  }
  await new Promise((r) => setTimeout(r, 300))
}
console.log(`${found}/${rows.length} images captured`)
