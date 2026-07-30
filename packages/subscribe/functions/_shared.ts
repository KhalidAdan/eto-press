/**
 * The mail slot's shared internals (Pages Functions edition). The subscribe
 * flow lives INSIDE the Pages project — same deploy as the site, no Workers
 * routes, no separate infrastructure. Stateless: the reader list is SES's;
 * these functions hold one narrow key and an HMAC secret and store nothing.
 */
import { AwsClient } from "aws4fetch"

export interface Env {
  AWS_ACCESS_KEY_ID: string
  AWS_SECRET_ACCESS_KEY: string
  SUBSCRIBE_SECRET: string
}

export const REGION = "ca-central-1"
export const SES = `https://email.${REGION}.amazonaws.com/v2/email`
export const LIST = "eto-readers"
export const TOPIC = "morning-edition"
export const CONFIG_SET = "eto-mail"
export const FROM = "eto <brief@eto.news>"
export const SITE = "https://eto.news"
export const TOKEN_TTL_MS = 7 * 24 * 3600 * 1000

const INK = "#0a0a0a"
export const CLARET = "#7f1d1d"
const QUIET = "#6b6b6b"
const SERIF = "Georgia, 'Times New Roman', serif"
export const MONO = "Consolas, Menlo, 'Courier New', monospace"

export const esc = (s: string): string =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")

export const page = (title: string, body: string, status = 200): Response =>
  new Response(
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>eto — ${esc(title)}</title><link rel="icon" type="image/png" href="${SITE}/favicon.png"></head>
<body style="margin:0;background:#ffffff;"><div style="max-width:560px;margin:0 auto;padding:48px 20px;text-align:center;">
<p style="margin:0;font-family:${SERIF};font-size:40px;font-weight:500;color:${INK};"><a href="${SITE}" style="color:${INK};text-decoration:none;">eto</a></p>
<p style="margin:6px 0 34px 0;font-family:${MONO};font-size:12px;color:${QUIET};">One story. Every side. Then it ends.</p>
${body}
</div></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } }
  )

export const prose = (text: string): string =>
  `<p style="margin:0 0 14px 0;font-family:${SERIF};font-size:17px;line-height:1.6;color:${INK};">${text}</p>`

export const formHtml = `
<form method="POST" action="/subscribe" style="margin:24px 0 0 0;">
  <div style="position:absolute;left:-5000px;" aria-hidden="true"><input type="text" name="website" tabindex="-1" autocomplete="off"></div>
  <input type="email" name="email" required placeholder="you@example.com" style="font-family:${MONO};font-size:15px;padding:10px 12px;border:1px solid #c9c9c9;width:60%;max-width:300px;color:${INK};">
  <button type="submit" style="font-family:${MONO};font-size:15px;padding:10px 18px;border:1px solid ${INK};background:${INK};color:#ffffff;cursor:pointer;">Subscribe</button>
  <p style="margin:12px 0 0 0;font-family:${MONO};font-size:12px;color:${QUIET};">One email each morning. Unsubscribe in every footer.</p>
</form>`

export const hmacHex = async (secret: string, message: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

export const validEmail = (e: string): boolean =>
  /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && e.length <= 254

export const awsClient = (env: Env): AwsClient =>
  new AwsClient({
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    region: REGION,
    service: "ses"
  })
