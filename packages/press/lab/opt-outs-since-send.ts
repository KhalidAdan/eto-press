/**
 * One-off: the unsubscribe history, fully dated, lined up against the send
 * record (email_sends in the journal). Every opt-out prints with date and
 * time, and each edition gets a tally of the departures that followed it —
 * attrition per edition, not one pooled number.
 */
import { ListContactsCommand, SESv2Client } from "@aws-sdk/client-sesv2"
import Database from "better-sqlite3"
import { loadEnv } from "../src/env.js"

loadEnv()
const CONTACT_LIST = "eto-readers"
const TOPIC = "morning-edition"

const ses = new SESv2Client({ region: process.env["AWS_REGION"] ?? "ca-central-1" })
const db = new Database("db/eto.sqlite", { readonly: true })
const sends = db
  .prepare("SELECT run_id, sent_at, recipients FROM email_sends ORDER BY sent_at")
  .all() as Array<{ run_id: string; sent_at: string; recipients: number }>

const mask = (e: string) => {
  const [user, domain] = e.split("@")
  return `${(user ?? "").slice(0, 2)}***@${domain}`
}
// "sv-SE" locale renders 2026-08-01 06:31:58 — dates and times, sortable.
const fmt = (d: Date) => d.toLocaleString("sv-SE")

const optOuts: Array<{ email: string; when: Date }> = []
let undated = 0
let nextToken: string | undefined
do {
  const page = await ses.send(
    new ListContactsCommand({ ContactListName: CONTACT_LIST, PageSize: 100, NextToken: nextToken })
  )
  for (const c of page.Contacts ?? []) {
    const pref = (c.TopicPreferences ?? c.TopicDefaultPreferences ?? []).find(
      (p) => p.TopicName === TOPIC
    )
    const out = c.UnsubscribeAll === true || pref?.SubscriptionStatus === "OPT_OUT"
    if (!out) continue
    if (c.LastUpdatedTimestamp) optOuts.push({ email: c.EmailAddress ?? "?", when: c.LastUpdatedTimestamp })
    else undated++
  }
  nextToken = page.NextToken
} while (nextToken)

optOuts.sort((a, b) => +a.when - +b.when)
console.log(`opt-out history (${optOuts.length + undated} all-time${undated > 0 ? `, ${undated} with no timestamp` : ""}):`)
for (const r of optOuts) console.log(`  ${fmt(r.when)}  ${mask(r.email)}`)

console.log("\nper edition (departures between this send and the next):")
for (const [i, s] of sends.entries()) {
  const from = new Date(s.sent_at)
  const to = i + 1 < sends.length ? new Date(sends[i + 1]!.sent_at) : new Date(8640000000000000)
  const n = optOuts.filter((r) => r.when >= from && r.when < to).length
  const open = i + 1 < sends.length ? "" : " (edition still current)"
  console.log(`  ${s.run_id} edition (sent ${fmt(from)}, ${s.recipients} recipients): ${n} opt-out(s)${open}`)
}
const before = sends.length > 0 ? optOuts.filter((r) => r.when < new Date(sends[0]!.sent_at)).length : 0
if (before > 0) console.log(`  (${before} opt-out(s) predate the first recorded send)`)
