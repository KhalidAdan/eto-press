/**
 * Nightly binary backup of the whole journal to a directory OUTSIDE the
 * repo (E:\eto-backups), using SQLite's online backup API so a mid-write
 * snapshot can never be corrupt. Keeps the newest 14. The paperboy runs
 * this after publishing.
 */
import { existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { openJournal } from "./assemble.js"
import { BACKUP } from "./config.js"

const DIR = BACKUP.dir
const KEEP = BACKUP.keep

mkdirSync(DIR, { recursive: true })
const stamp = new Date().toISOString().slice(0, 10)
const target = join(DIR, `eto-${stamp}.sqlite`)

const db = openJournal()
await db.backup(target)
console.log(`journal backed up to ${target}`)

const backups = readdirSync(DIR)
  .filter((f) => /^eto-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f))
  .sort()
while (backups.length > KEEP) {
  const oldest = backups.shift()!
  if (existsSync(join(DIR, oldest))) unlinkSync(join(DIR, oldest))
  console.log(`rotated out ${oldest}`)
}
