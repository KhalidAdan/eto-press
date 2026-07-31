/**
 * One-off: count readers who unsubscribed (topic OPT_OUT / UnsubscribeAll)
 * since this morning's send, using each contact's LastUpdatedTimestamp.
 */
import { ListContactsCommand, SESv2Client } from "@aws-sdk/client-sesv2"
import { loadEnv } from "../src/env.js"

loadEnv()
const CONTACT_LIST = "eto-readers"
const TOPIC = "morning-edition"
const SEND_STARTED = new Date(2026, 6, 30, 8, 49, 0) // local, from today's log

const ses = new SESv2Client({ region: process.env["AWS_REGION"] ?? "ca-central-1" })

const mask = (e: string) => {
  const [user, domain] = e.split("@")
  return `${(user ?? "").slice(0, 2)}***@${domain}`
}

let optedOutTotal = 0
const sinceSend: Array<{ email: string; when: Date | undefined }> = []
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
    optedOutTotal++
    const when = c.LastUpdatedTimestamp
    if (when && when >= SEND_STARTED) {
      sinceSend.push({ email: c.EmailAddress ?? "?", when })
    }
  }
  nextToken = page.NextToken
} while (nextToken)

console.log(`opted out since this morning's send: ${sinceSend.length}`)
for (const r of sinceSend.sort((a, b) => +(a.when ?? 0) - +(b.when ?? 0))) {
  console.log(`  ${r.when?.toLocaleTimeString()} ${mask(r.email)}`)
}
console.log(`(all-time opted out on the list: ${optedOutTotal})`)
