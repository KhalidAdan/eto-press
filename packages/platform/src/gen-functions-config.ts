/**
 * Codegen: functions/_config.ts from eto.toml (via src/config.ts).
 *
 * Pages Functions deploy as their own little world — they cannot read the
 * repo's TOML at runtime, and importing across the functions/ boundary is
 * a bundling gamble. So the paper's identity is written INTO that world
 * as a generated module, committed, and refreshed by every `npm run
 * render` (which the paperboy runs before the deploy commit). One source
 * of truth, one direction of flow.
 */
import { writeFileSync } from "node:fs"
import {
  ACCENT,
  MAIL,
  MAIL_TAG_KIND,
  PAPER_MOTTO,
  PAPER_MOTTO_INLINE,
  PAPER_NAME,
  SITE_HOST,
  SITE_URL
} from "./config.js"

const q = (s: string): string => JSON.stringify(s)

const out = `// GENERATED from eto.toml by src/gen-functions-config.ts — do not edit.
// Refreshed by \`npm run render\`; commit alongside the edition.
export const NAME = ${q(PAPER_NAME)}
export const MOTTO = ${q(PAPER_MOTTO)}
export const MOTTO_INLINE = ${q(PAPER_MOTTO_INLINE)}
export const SITE = ${q(SITE_URL)}
export const HOST = ${q(SITE_HOST)}
export const CLARET = ${q(ACCENT)}
export const REGION = ${q(MAIL.region)}
export const FROM = ${q(MAIL.from)}
export const LIST = ${q(MAIL.contactList)}
export const TOPIC = ${q(MAIL.topic)}
export const CONFIG_SET = ${q(MAIL.configSet)}
export const TAG_KIND = ${q(MAIL_TAG_KIND)}
`

writeFileSync("functions/_config.ts", out)
console.log("functions/_config.ts written from eto.toml")
