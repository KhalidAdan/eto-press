/**
 * One-time SES setup: verify the sending domain (prints the DKIM records
 * to paste into Cloudflare DNS), create the reader contact list, and
 * verify the editor's own address for sandbox testing.
 * Idempotent — safe to rerun. Run: npx tsx lab/ses-setup.ts
 */
import {
  CreateContactListCommand,
  CreateEmailIdentityCommand,
  GetEmailIdentityCommand,
  SESv2Client
} from "@aws-sdk/client-sesv2"
import { loadEnv } from "../src/env.js"

loadEnv()
const DOMAIN = "eto.news"
const EDITOR = "khalidadan@gmail.com"
export const CONTACT_LIST = "eto-readers"

const ses = new SESv2Client({ region: process.env["AWS_REGION"] })

const ensure = async <T>(label: string, fn: () => Promise<T>): Promise<T | null> => {
  try {
    const r = await fn()
    console.log(`ok      ${label}`)
    return r
  } catch (e: unknown) {
    const name = (e as { name?: string }).name ?? ""
    if (name === "AlreadyExistsException" || name === "ConflictException") {
      console.log(`exists  ${label}`)
      return null
    }
    throw e
  }
}

await ensure(`domain identity ${DOMAIN}`, () =>
  ses.send(new CreateEmailIdentityCommand({ EmailIdentity: DOMAIN }))
)
await ensure(`editor identity ${EDITOR} (verification email sent)`, () =>
  ses.send(new CreateEmailIdentityCommand({ EmailIdentity: EDITOR }))
)
await ensure(`contact list ${CONTACT_LIST}`, () =>
  ses.send(
    new CreateContactListCommand({
      ContactListName: CONTACT_LIST,
      Description: "Readers of the eto morning edition",
      Topics: [
        {
          TopicName: "morning-edition",
          DisplayName: "The morning edition",
          DefaultSubscriptionStatus: "OPT_IN"
        }
      ]
    })
  )
)

const identity = await ses.send(
  new GetEmailIdentityCommand({ EmailIdentity: DOMAIN })
)
console.log("\nDKIM status:", identity.DkimAttributes?.Status)
console.log("Paste these three CNAME records into Cloudflare DNS (eto.news zone),")
console.log("proxy status: DNS only:\n")
for (const token of identity.DkimAttributes?.Tokens ?? []) {
  console.log(`  CNAME  ${token}._domainkey  ->  ${token}.dkim.amazonses.com`)
}
