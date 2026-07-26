/** /subscribe — the form (GET) and the double-opt-in kickoff (POST). */
import {
  awsClient,
  CLARET,
  esc,
  formHtml,
  FROM,
  hmacHex,
  MONO,
  page,
  prose,
  SES,
  SITE,
  validEmail,
  type Env
} from "../_shared.js"

export const onRequestGet: PagesFunction<Env> = async () =>
  page(
    "subscribe",
    prose("Get the morning edition by email — one story, every side, then it ends.") + formHtml
  )

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const form = await request.formData().catch(() => null)
  const email = String(form?.get("email") ?? "").trim().toLowerCase()
  const honeypot = String(form?.get("website") ?? "")

  // Bots that fill the hidden field get a polite lie and no email.
  if (honeypot !== "" || !validEmail(email)) {
    return page(
      "check your inbox",
      prose("If that address is valid, a confirmation is on its way. Click the link inside and the morning edition is yours.")
    )
  }

  const ts = Date.now().toString()
  const sig = await hmacHex(env.SUBSCRIBE_SECRET, `${email}:${ts}`)
  const confirmUrl = `${SITE}/subscribe/confirm?e=${encodeURIComponent(email)}&t=${ts}&s=${sig}`
  const QUIET = "#6b6b6b"
  const SERIF = "Georgia, 'Times New Roman', serif"

  const send = await awsClient(env).fetch(`${SES}/outbound-emails`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      FromEmailAddress: FROM,
      Destination: { ToAddresses: [email] },
      Content: {
        Simple: {
          Subject: { Data: "eto — confirm your subscription" },
          Body: {
            Html: {
              Data: `<div style="max-width:560px;margin:0 auto;padding:28px 20px;font-family:${SERIF};color:#0a0a0a;"><p style="font-size:34px;margin:0 0 4px 0;">eto</p><p style="font-family:${MONO};font-size:12px;color:${QUIET};margin:0 0 24px 0;">One story. Every side. Then it ends.</p><p style="font-size:16px;line-height:1.6;">You (or someone claiming your inbox) asked for the morning edition. One click to confirm, and it arrives each day, ends, and lets you leave:</p><p style="margin:22px 0;"><a href="${confirmUrl}" style="font-family:${MONO};font-size:15px;color:${CLARET};">Confirm subscription</a></p><p style="font-family:${MONO};font-size:12px;color:${QUIET};">If you didn't ask, ignore this and nothing happens. The link expires in 7 days.</p></div>`
            },
            Text: {
              Data: `eto — one story, every side, then it ends.\n\nConfirm your subscription to the morning edition:\n${confirmUrl}\n\nIf you didn't ask, ignore this and nothing happens. The link expires in 7 days.`
            }
          }
        }
      }
    })
  })

  if (!send.ok) {
    return page(
      "try again",
      prose("The confirmation email could not be sent just now. Nothing was stored. Please try again in a minute."),
      502
    )
  }
  return page(
    "check your inbox",
    prose(`A confirmation is on its way to <span style="font-family:${MONO};">${esc(email)}</span>. Click the link inside and the morning edition is yours.`)
  )
}
