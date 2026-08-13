/**
 * Nightly export of the eto-readers contact list — the one piece of eto
 * that lives only in AWS. Every contact (opted-out included: opt-out
 * state is part of the record) lands as JSONL in E:\eto-backups next to
 * the journal snapshots. Keeps the newest 14. Never committed: the repo
 * is public and reader addresses stay private (NORTH-STAR §7).
 * Restore path: the JSONL is CreateContact-shaped — see lab/ses-import.ts
 * for the loop.
 */
import {
  ListContactsCommand,
  SESv2Client
} from "@aws-sdk/client-sesv2"
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { BACKUP, MAIL } from "./config.js"
import { loadEnv } from "./env.js"

loadEnv()
const DIR = BACKUP.dir
const KEEP = BACKUP.keep
const CONTACT_LIST = MAIL.contactList

const ses = new SESv2Client({ region: process.env["AWS_REGION"] ?? MAIL.region })

const lines: Array<string> = []
let nextToken: string | undefined
do {
  const page = await ses.send(
    new ListContactsCommand({
      ContactListName: CONTACT_LIST,
      PageSize: 100,
      NextToken: nextToken
    })
  )
  for (const c of page.Contacts ?? []) {
    lines.push(
      JSON.stringify({
        email: c.EmailAddress,
        topicPreferences: c.TopicPreferences ?? null,
        topicDefaultPreferences: c.TopicDefaultPreferences ?? null,
        unsubscribeAll: c.UnsubscribeAll ?? false,
        lastUpdated: c.LastUpdatedTimestamp?.toISOString() ?? null
      })
    )
  }
  nextToken = page.NextToken
} while (nextToken)

mkdirSync(DIR, { recursive: true })
const stamp = new Date().toISOString().slice(0, 10)
const target = join(DIR, `readers-${stamp}.jsonl`)
writeFileSync(target, lines.join("\n") + (lines.length > 0 ? "\n" : ""))
console.log(`${lines.length} reader(s) backed up to ${target}`)

const backups = readdirSync(DIR)
  .filter((f) => /^readers-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
  .sort()
while (backups.length > KEEP) {
  const oldest = backups.shift()!
  if (existsSync(join(DIR, oldest))) unlinkSync(join(DIR, oldest))
  console.log(`rotated out ${oldest}`)
}
