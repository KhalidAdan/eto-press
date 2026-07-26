/**
 * One-time: import the Substack subscriber export into the SES contact
 * list. Takes ONLY the Email column — the forty columns of engagement
 * surveillance stay behind, deliberately (NORTH-STAR §7 extends to
 * inboxes). Prints counts, never addresses. Idempotent.
 * Run: npx tsx lab/ses-import.ts "<path-to-export.csv>"
 */
import {
  CreateContactCommand,
  SESv2Client
} from "@aws-sdk/client-sesv2"
import { readFileSync } from "node:fs"
import { loadEnv } from "../src/env.js"

loadEnv()
const CONTACT_LIST = "eto-readers"
const csvPath = process.argv[2]
if (!csvPath) {
  console.error("usage: npx tsx lab/ses-import.ts <export.csv>")
  process.exit(1)
}

const ses = new SESv2Client({ region: process.env["AWS_REGION"] })

const lines = readFileSync(csvPath, "utf8").split(/\r?\n/).filter((l) => l.trim())
const header = lines[0]!.split(",")
if (header[0] !== "Email") {
  console.error(`expected first column "Email", got "${header[0]}"`)
  process.exit(1)
}

const emails = lines.slice(1).map((line) => {
  const first = line.startsWith('"')
    ? line.slice(1, line.indexOf('"', 1))
    : line.slice(0, line.indexOf(","))
  return first.trim().toLowerCase()
})
const valid = [...new Set(emails)].filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))
console.log(`${lines.length - 1} rows -> ${valid.length} unique valid addresses`)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let created = 0
let existing = 0
let failed = 0
const errorNames = new Map<string, number>()

for (const email of valid) {
  let attempt = 0
  for (;;) {
    try {
      await ses.send(
        new CreateContactCommand({
          ContactListName: CONTACT_LIST,
          EmailAddress: email,
          TopicPreferences: [
            { TopicName: "morning-edition", SubscriptionStatus: "OPT_IN" }
          ]
        })
      )
      created++
      break
    } catch (e: unknown) {
      const name = (e as { name?: string }).name ?? "Unknown"
      if (name === "AlreadyExistsException") {
        existing++
        break
      }
      if (name === "TooManyRequestsException" || name === "ThrottlingException") {
        attempt++
        if (attempt <= 6) {
          await sleep(250 * 2 ** attempt)
          continue
        }
      }
      errorNames.set(name, (errorNames.get(name) ?? 0) + 1)
      failed++
      break
    }
  }
  await sleep(120) // stay politely under the CreateContact rate limit
  if ((created + existing + failed) % 50 === 0) {
    console.log(`  ${created + existing + failed}/${valid.length}...`)
  }
}
console.log(`done: ${created} imported, ${existing} already present, ${failed} failed`)
if (errorNames.size > 0) {
  console.log("failure reasons:", Object.fromEntries(errorNames))
}
