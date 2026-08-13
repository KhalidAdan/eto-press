/**
 * The paper's configuration — eto.toml at the repo root, loaded once,
 * synchronously, at module init.
 *
 * sources.toml is the editorial line (which outlets, standing where);
 * eto.toml is the nameplate and plumbing: what the paper is called, where
 * it lives, which models print it, how the mail goes out, where the
 * backups land. Every field defaults to the flagship paper's value, so a
 * missing or partial file behaves exactly like the constants it replaced.
 */
import { existsSync, readFileSync } from "node:fs"
import * as TOML from "smol-toml"

type Table = Record<string, unknown>

const CONFIG_PATH = "eto.toml"

const root: Table = existsSync(CONFIG_PATH)
  ? (() => {
      try {
        return TOML.parse(readFileSync(CONFIG_PATH, "utf8")) as Table
      } catch (e) {
        throw new Error(`${CONFIG_PATH} is not valid TOML: ${String(e)}`)
      }
    })()
  : {}

const section = (key: string): Table => {
  const t = root[key]
  return typeof t === "object" && t !== null && !Array.isArray(t) ? (t as Table) : {}
}
const str = (t: Table, section: string, key: string, fallback: string): string => {
  const v = t[key]
  if (v === undefined) return fallback
  if (typeof v !== "string") throw new Error(`${CONFIG_PATH}: [${section}] ${key} must be a string`)
  return v
}
const int = (t: Table, section: string, key: string, fallback: number): number => {
  const v = t[key]
  if (v === undefined) return fallback
  if (typeof v !== "number" || !Number.isInteger(v))
    throw new Error(`${CONFIG_PATH}: [${section}] ${key} must be an integer`)
  return v
}

const paper = section("paper")
const models = section("models")
const mail = section("mail")
const backup = section("backup")

export const PAPER_NAME = str(paper, "paper", "name", "eto")
export const PAPER_MOTTO = str(paper, "paper", "motto", "Each story. Every side.")
export const PAPER_DESCRIPTION = str(
  paper,
  "paper",
  "description",
  "A daily brief. Each story is one event told through outlets that " +
    "disagree — differences named in plain words, every source linked, " +
    "coverage gaps measured. Then it ends."
)
export const SITE_URL = str(paper, "paper", "site_url", "https://eto.news")
/** The single accent color — the paper's own voice, never the news's. */
export const ACCENT = str(paper, "paper", "accent", "#7f1d1d")

/** The nameplate's short address: "eto.news" from "https://eto.news". */
export const SITE_HOST = new URL(SITE_URL).host
/** The motto as an inline clause: "Each story. Every side." becomes
 * "each story, every side" — for titles and running text. */
export const PAPER_MOTTO_INLINE = PAPER_MOTTO.replace(/\.\s+/g, ", ")
  .replace(/\.$/, "")
  .toLowerCase()

export const OLLAMA_URL = str(models, "models", "ollama_url", "http://localhost:11434")

/** Matching is high-volume: a small model that just answers, no thinking. */
export const MATCH_MODEL = str(models, "models", "match", "qwen3:4b-instruct")

/** Compositing is low-volume — a handful of stories a day — and can afford
 * a larger model with a longer context. qwen3:8b won the 2026-07-31
 * audition (lab/composite-eval.ts): zero fabricated quotes across nine
 * stories, and the only candidate that refused to mash incoherent inputs
 * into one story. llama3.1:8b retired after the fabricated-BBC incident. */
export const COMPOSITE_MODEL = str(models, "models", "composite", "qwen3:8b")
export const COMPOSITE_NUM_CTX = int(models, "models", "composite_num_ctx", 8192)

export const MAIL = {
  region: str(mail, "mail", "region", "ca-central-1"),
  domain: str(mail, "mail", "domain", "eto.news"),
  from: str(mail, "mail", "from", "eto <brief@eto.news>"),
  fromFallback: str(mail, "mail", "from_fallback", "khalidadan@gmail.com"),
  contactList: str(mail, "mail", "contact_list", "eto-readers"),
  topic: str(mail, "mail", "topic", "morning-edition"),
  configSet: str(mail, "mail", "config_set", "eto-mail")
} as const

/** EmailTags dimension name, derived from the configuration set. */
export const MAIL_TAG_KIND = `${MAIL.configSet}-kind`

export const BACKUP = {
  dir: str(backup, "backup", "dir", "E:\\eto-backups"),
  keep: int(backup, "backup", "keep", 14)
} as const
