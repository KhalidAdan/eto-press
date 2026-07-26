/** /subscribe/confirm — the signed link from the confirmation email. */
import {
  awsClient,
  CLARET,
  hmacHex,
  LIST,
  page,
  prose,
  SES,
  SITE,
  TOKEN_TTL_MS,
  TOPIC,
  validEmail,
  type Env
} from "../_shared.js"

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url)
  const email = (url.searchParams.get("e") ?? "").trim().toLowerCase()
  const ts = url.searchParams.get("t") ?? ""
  const sig = url.searchParams.get("s") ?? ""
  const expected = await hmacHex(env.SUBSCRIBE_SECRET, `${email}:${ts}`)
  const fresh = Number(ts) > 0 && Date.now() - Number(ts) < TOKEN_TTL_MS

  if (!validEmail(email) || !fresh || sig !== expected) {
    return page(
      "link expired",
      prose(`That confirmation link is invalid or has expired. <a href="/subscribe" style="color:${CLARET};">Ask for a fresh one.</a>`),
      400
    )
  }

  const create = await awsClient(env).fetch(`${SES}/contact-lists/${LIST}/contacts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      EmailAddress: email,
      TopicPreferences: [{ TopicName: TOPIC, SubscriptionStatus: "OPT_IN" }]
    })
  })

  if (!create.ok && create.status !== 409) {
    return page(
      "try again",
      prose("Confirmation worked, but the list could not be updated just now. Please click the link again in a minute."),
      502
    )
  }
  return page(
    "you're in",
    prose("Confirmed. The morning edition arrives each day, ends, and lets you leave — there's an unsubscribe link in every footer.") +
      prose(`Today's edition is already up: <a href="${SITE}" style="color:${CLARET};">eto.news</a>`)
  )
}
