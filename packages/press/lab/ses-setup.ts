/**
 * One-time SES setup: verify the sending domain (prints the DKIM records
 * to paste into Cloudflare DNS), create the reader contact list, verify
 * the editor's own address for sandbox testing, pin the account-level
 * suppression list to bounces AND complaints, and create the "eto-mail"
 * configuration set (reputation metrics on, bounce/complaint/reject
 * events mirrored to CloudWatch) that every send tags itself with.
 * Idempotent — safe to rerun. Run: npx tsx lab/ses-setup.ts
 */
import {
  CreateConfigurationSetCommand,
  CreateConfigurationSetEventDestinationCommand,
  CreateContactListCommand,
  CreateEmailIdentityCommand,
  GetEmailIdentityCommand,
  PutAccountSuppressionAttributesCommand,
  SESv2Client
} from "@aws-sdk/client-sesv2"
import { loadEnv } from "../src/env.js"

loadEnv()
const DOMAIN = "eto.news"
const EDITOR = "khalidadan@gmail.com"
export const CONTACT_LIST = "eto-readers"
export const CONFIG_SET = "eto-mail"

const ses = new SESv2Client({ region: process.env["AWS_REGION"] })

const ensure = async <T>(label: string, fn: () => Promise<T>): Promise<T | null> => {
  try {
    const r = await fn()
    console.log(`ok      ${label}`)
    return r
  } catch (e: unknown) {
    const name = (e as { name?: string }).name ?? ""
    const message = (e as { message?: string }).message ?? ""
    if (
      name === "AlreadyExistsException" ||
      name === "ConflictException" ||
      message.includes("maximum of 1 Lists")
    ) {
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

// Bounce and complaint handling (the SES production-access letter's one
// hard operational demand). Two layers:
//   1. The account-level suppression list swallows repeat sends to any
//      address that has bounced or complained — SES's default is BOUNCE
//      only, so pin it to both, explicitly.
//   2. The eto-mail configuration set tags every send; reputation metrics
//      make the bounce/complaint rates visible per-set in the console,
//      and the CloudWatch event destination keeps a metric trail with no
//      extra infrastructure to run. send-edition.ts then opts suppressed
//      readers out of the contact list each morning before delivering.
await ensure("account suppression list covers BOUNCE + COMPLAINT", () =>
  ses.send(
    new PutAccountSuppressionAttributesCommand({
      SuppressedReasons: ["BOUNCE", "COMPLAINT"]
    })
  )
)
await ensure(`configuration set ${CONFIG_SET}`, () =>
  ses.send(
    new CreateConfigurationSetCommand({
      ConfigurationSetName: CONFIG_SET,
      ReputationOptions: { ReputationMetricsEnabled: true },
      SendingOptions: { SendingEnabled: true }
    })
  )
)
await ensure(`event destination ${CONFIG_SET} -> CloudWatch`, () =>
  ses.send(
    new CreateConfigurationSetEventDestinationCommand({
      ConfigurationSetName: CONFIG_SET,
      EventDestinationName: "eto-mail-cloudwatch",
      EventDestination: {
        Enabled: true,
        MatchingEventTypes: ["SEND", "DELIVERY", "BOUNCE", "COMPLAINT", "REJECT"],
        CloudWatchDestination: {
          DimensionConfigurations: [
            {
              DimensionName: "eto-mail-kind",
              DimensionValueSource: "MESSAGE_TAG",
              DefaultDimensionValue: "unspecified"
            }
          ]
        }
      }
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
