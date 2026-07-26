/**
 * Deliver the latest published edition by email.
 *
 * Modes:
 *   npx tsx src/send-edition.ts --test you@example.com
 *     One proof copy to a (sandbox-verified) address. Ignores the toggle
 *     and the sent-guard; substitutes the unsubscribe link with the site.
 *   npx tsx src/send-edition.ts
 *     The real morning delivery: every OPT_IN contact in eto-readers.
 *     Guarded three ways — the masthead toggle (email_edition), the
 *     email_sends journal (never delivers the same edition twice), and
 *     per-recipient error isolation (one bad address never stops the run).
 *
 * From address: brief@eto.news once the domain identity verifies; until
 * then falls back to the editor's verified address, loudly.
 */
import {
  GetEmailIdentityCommand,
  ListContactsCommand,
  SendEmailCommand,
  SESv2Client
} from "@aws-sdk/client-sesv2"
import { readFileSync } from "node:fs"
import * as TOML from "smol-toml"
import { assembleStories, openJournal, publishedRuns } from "./assemble.js"
import { renderEmailEdition } from "./email.js"
import { loadEnv } from "./env.js"

loadEnv()
const CONTACT_LIST = "eto-readers"
const TOPIC = "morning-edition"
const DOMAIN = "eto.news"
const FROM_DOMAIN = `eto <brief@${DOMAIN}>`
const FROM_FALLBACK = "khalidadan@gmail.com"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const testFlag = process.argv.indexOf("--test")
const testAddr = testFlag > -1 ? (process.argv[testFlag + 1] ?? null) : null

const masthead = TOML.parse(readFileSync("sources.toml", "utf8")) as {
  email_edition?: boolean
}
if (testAddr === null && masthead.email_edition !== true) {
  console.log("email_edition is not enabled in sources.toml; nothing to do")
  process.exit(0)
}

const db = openJournal()
db.exec(`CREATE TABLE IF NOT EXISTS email_sends (
  run_id TEXT PRIMARY KEY, sent_at TEXT NOT NULL,
  recipients INTEGER NOT NULL, failures INTEGER NOT NULL
)`)
const runId = publishedRuns(db)[0]
if (!runId) {
  console.error("no published edition in the journal")
  process.exit(1)
}

if (testAddr === null) {
  const already = db
    .prepare("SELECT sent_at FROM email_sends WHERE run_id = ?")
    .get(runId) as { sent_at: string } | undefined
  if (already) {
    console.log(`edition ${runId} already emailed at ${already.sent_at}; nothing to do`)
    process.exit(0)
  }
}

const stories = assembleStories(db, runId).map((a) => a.story)
const edition = renderEmailEdition({ runId, stories })
const ses = new SESv2Client({ region: process.env["AWS_REGION"] ?? "ca-central-1" })

const domainIdentity = await ses
  .send(new GetEmailIdentityCommand({ EmailIdentity: DOMAIN }))
  .catch(() => null)
const domainReady = domainIdentity?.VerifiedForSendingStatus === true
const from = domainReady ? FROM_DOMAIN : FROM_FALLBACK
if (!domainReady) {
  console.log(`NOTE: ${DOMAIN} identity not verified yet — sending from ${FROM_FALLBACK}`)
}

if (testAddr !== null) {
  // Proof copy: no list management, so substitute the unsubscribe tag.
  const html = edition.html.replaceAll("{{amazonSESUnsubscribeUrl}}", "https://eto.news")
  const text = edition.text.replaceAll("{{amazonSESUnsubscribeUrl}}", "https://eto.news")
  await ses.send(
    new SendEmailCommand({
      FromEmailAddress: from,
      Destination: { ToAddresses: [testAddr] },
      Content: {
        Simple: {
          Subject: { Data: `[proof] ${edition.subject}` },
          Body: { Html: { Data: html }, Text: { Data: text } }
        }
      }
    })
  )
  console.log(`proof copy of ${runId} sent to ${testAddr} (from ${from})`)
  process.exit(0)
}

// The real delivery.
const recipients: Array<string> = []
let nextToken: string | undefined
do {
  const page = await ses.send(
    new ListContactsCommand({
      ContactListName: CONTACT_LIST,
      PageSize: 100,
      NextToken: nextToken,
      Filter: {
        FilteredStatus: "OPT_IN",
        TopicFilter: { TopicName: TOPIC, UseDefaultIfPreferenceUnavailable: true }
      }
    })
  )
  for (const c of page.Contacts ?? []) {
    if (c.EmailAddress) recipients.push(c.EmailAddress)
  }
  nextToken = page.NextToken
} while (nextToken)

console.log(`delivering ${runId} to ${recipients.length} readers (from ${from})`)
let sent = 0
let failed = 0
for (const to of recipients) {
  try {
    await ses.send(
      new SendEmailCommand({
        FromEmailAddress: from,
        Destination: { ToAddresses: [to] },
        Content: {
          Simple: {
            Subject: { Data: edition.subject },
            Body: { Html: { Data: edition.html }, Text: { Data: edition.text } }
          }
        },
        ListManagementOptions: { ContactListName: CONTACT_LIST, TopicName: TOPIC }
      })
    )
    sent++
  } catch {
    failed++
  }
  await sleep(120)
  if ((sent + failed) % 50 === 0) console.log(`  ${sent + failed}/${recipients.length}...`)
}

db.prepare(
  "INSERT INTO email_sends (run_id, sent_at, recipients, failures) VALUES (?, ?, ?, ?)"
).run(runId, new Date().toISOString(), sent, failed)
console.log(`delivered: ${sent} sent, ${failed} failed`)
process.exit(failed > 0 && sent === 0 ? 1 : 0)
