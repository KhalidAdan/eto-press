/** One-off: find a reader on the eto-readers list by substring. */
import { ListContactsCommand, SESv2Client } from "@aws-sdk/client-sesv2"
import { loadEnv } from "../src/env.js"

loadEnv()
const needle = (process.argv[2] ?? "").toLowerCase()
const ses = new SESv2Client({ region: process.env["AWS_REGION"] ?? "ca-central-1" })

let nextToken: string | undefined
let hits = 0
do {
  const page = await ses.send(
    new ListContactsCommand({ ContactListName: "eto-readers", PageSize: 100, NextToken: nextToken })
  )
  for (const c of page.Contacts ?? []) {
    if (!c.EmailAddress?.toLowerCase().includes(needle)) continue
    hits++
    const pref = (c.TopicPreferences ?? c.TopicDefaultPreferences ?? [])
      .map((p) => `${p.TopicName}=${p.SubscriptionStatus}`)
      .join(", ")
    console.log(
      `${c.EmailAddress}  unsubAll=${c.UnsubscribeAll}  ${pref}  updated=${c.LastUpdatedTimestamp?.toISOString()}`
    )
  }
  nextToken = page.NextToken
} while (nextToken)
console.log(hits === 0 ? "no match on the list" : `${hits} match(es)`)
