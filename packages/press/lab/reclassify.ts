/**
 * One-off: re-run the deterministic classifier over stored items after a
 * classifier change, reporting what moved. Stored `kind` is a cache whose
 * implicit key is the classifier version — until that key exists in the
 * schema, this script is the migration path. Run: npx tsx lab/reclassify.ts
 */
import Database from "better-sqlite3"
import { classify } from "../src/normalize.js"

const db = new Database("db/eto.sqlite")
const rows = db
  .prepare("SELECT id, title, link, kind FROM items")
  .all() as Array<{ id: number; title: string; link: string; kind: string }>

let changed = 0
for (const row of rows) {
  const kind = classify(row.title, row.link)
  if (kind !== row.kind) {
    db.prepare("UPDATE items SET kind = ? WHERE id = ?").run(kind, row.id)
    console.log(`${row.kind} -> ${kind} | ${row.title.slice(0, 70)}`)
    changed++
  }
}
console.log(`${changed} item(s) reclassified of ${rows.length}`)
