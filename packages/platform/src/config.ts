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
        // Some Windows editors prefix a UTF-8 BOM; TOML does not allow one.
        return TOML.parse(readFileSync(CONFIG_PATH, "utf8").replace(/^﻿/, "")) as Table
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
const engine = section("engine")

/** Which engine prints this paper when it declares no sections — a
 * paper-level declaration, not a download: the named engine must be a
 * dependency the press was built with. Absent means the eto engine, so
 * every existing paper is valid. Generation 3 reads it only as the
 * compatibility default for a paper without `[[section]]` blocks. */
export const ENGINE = str(engine, "engine", "use", "eto")

/** One desk of the paper: printed by one engine from one source file.
 * Order in eto.toml is order on the page. */
export interface SectionDecl {
  readonly name: string
  /** The address: `[a-z][a-z0-9-]*`. Names the section page, the desk
   * directory (`desk/<slug>/`), the default source file, the journal
   * rows. Unique within the paper. */
  readonly slug: string
  readonly engine: string
  /** The section's source file — sources.toml's shape, one per desk.
   * Defaults to `sections/<slug>.toml`. */
  readonly masthead: string
}

const SLUG = /^[a-z][a-z0-9-]*$/

/** The compatibility paper: no `[[section]]` blocks means one section,
 * printed by `[engine] use` from `sources.toml`. Its name never prints
 * (a single-section paper renders without section headings), but every
 * row it writes carries this slug. */
export const DEFAULT_SECTION_SLUG = "brief"

/** Pure: the `[[section]]` array of a parsed eto.toml, validated, or the
 * compatibility section when absent. Exported for tests; `SECTIONS`
 * below is the paper's. */
export const parseSections = (
  root: Table,
  fallbackEngine: string
): ReadonlyArray<SectionDecl> => {
  const raw = root["section"]
  if (raw === undefined) {
    return [
      {
        name: "Brief",
        slug: DEFAULT_SECTION_SLUG,
        engine: fallbackEngine,
        masthead: "sources.toml"
      }
    ]
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`${CONFIG_PATH}: [[section]] must be one or more tables`)
  }
  const sections: Array<SectionDecl> = []
  const seenSlug = new Set<string>()
  for (const [i, entry] of raw.entries()) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(`${CONFIG_PATH}: [[section]] #${i + 1} must be a table`)
    }
    const t = entry as Table
    const where = `[[section]] #${i + 1}`
    const slug = str(t, where, "slug", "")
    if (!SLUG.test(slug)) {
      throw new Error(
        `${CONFIG_PATH}: ${where} needs a slug matching ${SLUG} (lowercase, digits, dashes)`
      )
    }
    if (seenSlug.has(slug)) {
      throw new Error(`${CONFIG_PATH}: two sections share the slug "${slug}"`)
    }
    seenSlug.add(slug)
    const engineName = str(t, where, "engine", "")
    if (engineName === "") {
      throw new Error(`${CONFIG_PATH}: ${where} ("${slug}") names no engine`)
    }
    const name = str(t, where, "name", slug)
    const masthead = str(t, where, "masthead", `sections/${slug}.toml`)
    sections.push({ name, slug, engine: engineName, masthead })
  }
  return sections
}

/** The paper's sections, in print order. Always at least one. */
export const SECTIONS: ReadonlyArray<SectionDecl> = parseSections(root, ENGINE)

/** True when eto.toml declares `[[section]]` blocks — the paper prints
 * with section headings, desk directories per section, and so on. False
 * for the compatibility single-section paper, which renders exactly as
 * generation 2 did. */
export const SECTIONED = root["section"] !== undefined

// Defaults are NEUTRAL: a paper with no eto.toml is an unnamed Tier-1
// local paper, not a copy of the flagship. No default may carry any real
// paper's identity, address, or machine.
export const PAPER_NAME = str(paper, "paper", "name", "your paper")
export const PAPER_MOTTO = str(paper, "paper", "motto", "Write your masthead in eto.toml.")
export const PAPER_DESCRIPTION = str(
  paper,
  "paper",
  "description",
  "A daily brief. Each story is one event told through outlets that " +
    "disagree — differences named in plain words, every source linked, " +
    "coverage gaps measured. Then it ends."
)
export const SITE_URL = str(paper, "paper", "site_url", "http://localhost")
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
  // Identity defaults are empty: sending mail requires the paper to say
  // who it is. The list/topic/set names are press conventions, not
  // identity, and stay.
  domain: str(mail, "mail", "domain", ""),
  from: str(mail, "mail", "from", ""),
  fromFallback: str(mail, "mail", "from_fallback", ""),
  contactList: str(mail, "mail", "contact_list", "eto-readers"),
  topic: str(mail, "mail", "topic", "morning-edition"),
  configSet: str(mail, "mail", "config_set", "eto-mail"),
  /** Morning delivery on or off — the paper's switch, not a section's.
   * Null means undeclared here, and the sender falls back to the
   * `email_edition` flag in the first section's source file, where
   * generation 2 kept it. */
  emailEdition: ((): boolean | null => {
    const v = mail["email_edition"]
    if (v === undefined) return null
    if (typeof v !== "boolean") throw new Error(`${CONFIG_PATH}: [mail] email_edition must be true or false`)
    return v
  })()
} as const

/** EmailTags dimension name, derived from the configuration set. */
export const MAIL_TAG_KIND = `${MAIL.configSet}-kind`

export const BACKUP = {
  // Default is cwd-relative: a backup you did not configure still exists,
  // but it never assumes anyone's drive layout. Point it OUTSIDE the
  // paper's disk when you configure it for real.
  dir: str(backup, "backup", "dir", "backups"),
  keep: int(backup, "backup", "keep", 14)
} as const
