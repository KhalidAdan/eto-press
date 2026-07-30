/**
 * Deliver the latest published edition by email.
 *
 * Modes:
 *   npx tsx src/send-edition.ts --test you@example.com
 *     One proof copy to a (sandbox-verified) address. Ignores the toggle
 *     and the sent-guard; substitutes the unsubscribe link with the site.
 *     The shorthands `--test success`, `--test bounce`, `--test complaint`
 *     address the SES mailbox simulator — exercise the plumbing (including
 *     the suppression sweep) without touching a real inbox or the
 *     account's reputation.
 *   npx tsx src/send-edition.ts
 *     The real morning delivery: every OPT_IN contact in eto-readers.
 *
 * Guards, in the order they run:
 *   - sending health: GetAccount must say SendingEnabled — if SES has
 *     paused the account, stop loudly rather than queue failures;
 *   - the masthead toggle (email_edition) and the email_sends journal
 *     (never delivers the same edition twice);
 *   - suppression sweep: readers on the account suppression list (they
 *     bounced or complained) are opted out of the contact list before the
 *     run, so the list stays honest and no send is wasted on them;
 *   - daily quota: abort if the list exceeds what remains of the 24-hour
 *     quota; warn at 80% so the limit increase is requested BEFORE it's
 *     needed;
 *   - pacing derived from the account's MaxSendRate (floor 120ms/send);
 *   - per-recipient error isolation with backoff-retry on throttles —
 *     one bad address never stops the run, and failure reasons are
 *     counted and printed, not swallowed.
 *
 * Every send is tagged with the eto-mail configuration set (created by
 * lab/ses-setup.ts) so bounce and complaint rates are tracked per-set.
 *
 * From address: brief@eto.news once the domain identity verifies; until
 * then falls back to the editor's verified address, loudly.
 */
import {
  GetAccountCommand,
  GetEmailIdentityCommand,
  ListContactsCommand,
  ListSuppressedDestinationsCommand,
  SendEmailCommand,
  SESv2Client,
  UpdateContactCommand
} from "@aws-sdk/client-sesv2"
import { readFileSync } from "node:fs"
import * as TOML from "smol-toml"
import { assembleStories, correctionsPrintedIn, openJournal, publishedRuns } from "./assemble.js"
import { renderEmailEdition } from "./email.js"
import { loadEnv } from "./env.js"

loadEnv()
const CONTACT_LIST = "eto-readers"
const TOPIC = "morning-edition"
const DOMAIN = "eto.news"
const FROM_DOMAIN = `eto <brief@${DOMAIN}>`
const FROM_FALLBACK = "khalidadan@gmail.com"
const CONFIG_SET = "eto-mail"
const EDITION_TAGS = [{ Name: "eto-mail-kind", Value: "morning-edition" }]

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// SES mailbox simulator shorthands — testing that never dents reputation.
const SIMULATOR: Record<string, string> = {
  success: "success@simulator.amazonses.com",
  simulator: "success@simulator.amazonses.com",
  bounce: "bounce@simulator.amazonses.com",
  complaint: "complaint@simulator.amazonses.com"
}

const testFlag = process.argv.indexOf("--test")
const testArg = testFlag > -1 ? (process.argv[testFlag + 1] ?? null) : null
const testAddr = testArg === null ? null : (SIMULATOR[testArg] ?? testArg)

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
const edition = renderEmailEdition({
  runId,
  stories,
  corrections: correctionsPrintedIn(db, runId)
})
const ses = new SESv2Client({ region: process.env["AWS_REGION"] ?? "ca-central-1" })

// Sending health first: if SES has paused the account (reputation, review),
// every SendEmail would fail — stop before queuing a morning of errors.
const account = await ses.send(new GetAccountCommand({}))
if (account.SendingEnabled !== true) {
  console.error(
    "SES reports sending is DISABLED for this account — check the SES console " +
      "(reputation dashboard / suppression list) before trying again."
  )
  process.exit(1)
}
const quota = account.SendQuota ?? {}
const maxPerDay = quota.Max24HourSend ?? 0
const sentToday = quota.SentLast24Hours ?? 0
const maxPerSec = quota.MaxSendRate ?? 1
// Pace from the account's real rate, never faster than one send / 120ms.
const sendDelayMs = Math.max(120, Math.ceil(1000 / maxPerSec))

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
      ConfigurationSetName: CONFIG_SET,
      EmailTags: [{ Name: "eto-mail-kind", Value: "proof" }],
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

// Suppression sweep: SES already refuses to deliver to addresses that
// bounced or complained (account suppression list, pinned to both by
// lab/ses-setup.ts) — but a suppressed reader left on the contact list
// wastes a send against quota every morning and makes the reader count
// lie. Opt them out here, once, visibly.
const suppressed = new Set<string>()
let supToken: string | undefined
do {
  const page = await ses.send(
    new ListSuppressedDestinationsCommand({ PageSize: 100, NextToken: supToken })
  )
  for (const d of page.SuppressedDestinationSummaries ?? []) {
    if (d.EmailAddress) suppressed.add(d.EmailAddress.toLowerCase())
  }
  supToken = page.NextToken
} while (supToken)

const deliverable: Array<string> = []
let sweptOut = 0
for (const to of recipients) {
  if (!suppressed.has(to.toLowerCase())) {
    deliverable.push(to)
    continue
  }
  try {
    await ses.send(
      new UpdateContactCommand({
        ContactListName: CONTACT_LIST,
        EmailAddress: to,
        TopicPreferences: [{ TopicName: TOPIC, SubscriptionStatus: "OPT_OUT" }]
      })
    )
    sweptOut++
    await sleep(120)
  } catch {
    // Sweep is hygiene, not delivery: if the opt-out fails, the account
    // suppression list still protects the reader — just don't send today.
  }
}
if (sweptOut > 0) {
  console.log(`suppression sweep: ${sweptOut} bounced/complained reader(s) opted out`)
}

// Daily quota: never start a run the quota can't finish, and ask for a
// bigger limit before it's needed, not after it's hit.
const remainingToday = maxPerDay - sentToday
if (deliverable.length > remainingToday) {
  console.error(
    `refusing to start: ${deliverable.length} readers but only ${remainingToday} ` +
      `sends left of the ${maxPerDay}/day quota — request a limit increase in the SES console`
  )
  process.exit(1)
}
if (deliverable.length > maxPerDay * 0.8) {
  console.log(
    `NOTE: list size ${deliverable.length} is past 80% of the ${maxPerDay}/day quota — ` +
      "request the next limit increase now, before it's needed"
  )
}

console.log(`delivering ${runId} to ${deliverable.length} readers (from ${from})`)
let sent = 0
let failed = 0
const failureNames = new Map<string, number>()
for (const to of deliverable) {
  let attempt = 0
  for (;;) {
    try {
      await ses.send(
        new SendEmailCommand({
          FromEmailAddress: from,
          Destination: { ToAddresses: [to] },
          ConfigurationSetName: CONFIG_SET,
          EmailTags: EDITION_TAGS,
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
      break
    } catch (e: unknown) {
      const name = (e as { name?: string }).name ?? "Unknown"
      // Throttles are pacing, not verdicts on the address: back off, retry.
      if (name === "TooManyRequestsException" || name === "ThrottlingException") {
        attempt++
        if (attempt <= 5) {
          await sleep(500 * 2 ** attempt)
          continue
        }
      }
      failureNames.set(name, (failureNames.get(name) ?? 0) + 1)
      failed++
      break
    }
  }
  await sleep(sendDelayMs)
  if ((sent + failed) % 50 === 0) console.log(`  ${sent + failed}/${deliverable.length}...`)
}

db.prepare(
  "INSERT INTO email_sends (run_id, sent_at, recipients, failures) VALUES (?, ?, ?, ?)"
).run(runId, new Date().toISOString(), sent, failed)
console.log(`delivered: ${sent} sent, ${failed} failed`)
if (failureNames.size > 0) {
  console.log("failure reasons:", Object.fromEntries(failureNames))
}
process.exit(failed > 0 && sent === 0 ? 1 : 0)
