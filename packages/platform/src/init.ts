/**
 * eto init — a paper comes into existence.
 *
 *   eto init [dir]                     ask, then scaffold
 *   eto init [dir] --name "…" --motto "…" --site-url "…" --accent "#…"
 *                                      scaffold without asking
 *
 * What it makes is a PAPER: a directory the press visits. A complete
 * eto.toml (every field written — the paper never leans on the press's
 * defaults), the Default Masthead seeded from the audited AllSides shelf
 * (with its [seed] provenance declared, deletable the day you disagree),
 * .env.example, .gitignore. It never overwrites an existing paper.
 *
 * Zero accounts, zero secrets — a Tier-1 paper, printable the moment
 * the models are pulled. The wizard's last words are the next verbs.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { createInterface } from "node:readline/promises"

const argv = process.argv.slice(2)
const flags = new Map<string, string>()
const positional: Array<string> = []
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]!
  if (a.startsWith("--")) {
    flags.set(a.slice(2), argv[i + 1] ?? "")
    i++
  } else {
    positional.push(a)
  }
}

const dir = resolve(positional[0] ?? ".")
if (existsSync(join(dir, "eto.toml")) || existsSync(join(dir, "sources.toml"))) {
  console.error(`${dir} already looks like a paper — init never overwrites one`)
  process.exit(1)
}

const HEX = /^#[0-9a-fA-F]{6}$/
const interactive = process.stdin.isTTY === true && !flags.has("name")

const ask = async (): Promise<{ name: string; motto: string; siteUrl: string; accent: string }> => {
  if (!interactive) {
    return {
      name: flags.get("name") ?? "your paper",
      motto: flags.get("motto") ?? "Write your masthead in eto.toml.",
      siteUrl: flags.get("site-url") ?? "http://localhost",
      accent: HEX.test(flags.get("accent") ?? "") ? flags.get("accent")! : "#7f1d1d"
    }
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  console.log("A paper needs a masthead. Three questions, all changeable later in eto.toml.\n")
  const name = (await rl.question("  The paper's name: ")).trim() || "your paper"
  const motto = (await rl.question("  Its motto (one line under the name): ")).trim() ||
    "Write your masthead in eto.toml."
  const siteUrl =
    (await rl.question("  Its web address, if it has one [http://localhost]: ")).trim() ||
    "http://localhost"
  let accent = (await rl.question("  Its accent color, as hex [#7f1d1d]: ")).trim() || "#7f1d1d"
  if (!HEX.test(accent)) accent = "#7f1d1d"
  rl.close()
  return { name, motto, siteUrl, accent }
}

const { name, motto, siteUrl, accent } = await ask()

const tomlStr = (s: string): string => JSON.stringify(s)

mkdirSync(dir, { recursive: true })
writeFileSync(
  join(dir, "eto.toml"),
  `# eto.toml — this paper's nameplate and plumbing.
#
# sources.toml is the editorial line: which outlets, standing where. This
# file is everything else the paper owns. Every field is written out —
# this paper leans on no one's defaults.

[paper]
name = ${tomlStr(name)}
motto = ${tomlStr(motto)}
description = ${tomlStr(
    "A daily brief. Each story is one event told through outlets that disagree — differences named in plain words, every source linked, coverage gaps measured. Then it ends."
  )}
site_url = ${tomlStr(siteUrl)}
# The single accent — spent only on the paper's own measurements, never
# on the news.
accent = ${tomlStr(accent)}

[models]
ollama_url = "http://localhost:11434"
match = "qwen3:4b-instruct"
composite = "qwen3:8b"
composite_num_ctx = 8192

# Tier 3 only: the mailing list. The paper prints without any of this.
# Fill in when you have a verified sending domain (eto's SES setup notes:
# docs/DEPLOY.md in the eto-press repository), then flip email_edition
# in sources.toml.
[mail]
region = "ca-central-1"
domain = ""
from = ""
from_fallback = ""
contact_list = "eto-readers"
topic = "morning-edition"
config_set = "eto-mail"

[backup]
# Point this OUTSIDE the paper's disk when you can.
dir = "backups"
keep = 14
`
)
writeFileSync(join(dir, "sources.toml"), readFileSync(new URL("./seed-masthead.toml", import.meta.url), "utf8"))
writeFileSync(
  join(dir, ".env.example"),
  `# Secrets — copy to .env (gitignored). Only needed for the email edition;
# the paper prints without them.
AWS_REGION=ca-central-1
AWS_ACCESS_KEY=your-access-key-id
AWS_SECRET=your-secret-access-key
`
)
writeFileSync(
  join(dir, ".gitignore"),
  `node_modules/
db/
logs/
backups/
.env
`
)

// -- the moment ---------------------------------------------------------------
const r = parseInt(accent.slice(1, 3), 16)
const g = parseInt(accent.slice(3, 5), 16)
const b = parseInt(accent.slice(5, 7), 16)
const claret = (s: string): string => `\x1b[1m\x1b[38;2;${r};${g};${b}m${s}\x1b[0m`
console.log(`\n  ${name}${claret(".")}`)
console.log(`  ${motto}\n`)
console.log(`the paper exists at ${dir} — 33 sources on the masthead, yours to edit.`)
console.log(`\nNext, in that directory:`)
console.log(`  npm init -y && npm install @eto-press/press @eto-press/cli`)
console.log(`  eto models pull      the two local models, pinned when they land`)
console.log(`  eto doctor           examine the press before trusting it`)
console.log(`  eto print            your first edition (a GPU morning's work)`)
console.log(`  eto schedule         make it every morning`)
