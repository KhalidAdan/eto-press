/**
 * Docs-accuracy tests: the documentation site's reference pages are pinned
 * to the code they document. Documentation that drifts fails CI here, not
 * in front of a reader.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  ACCENT,
  BACKUP,
  COMPOSITE_MODEL,
  ENGINE,
  MAIL,
  MATCH_MODEL,
  OLLAMA_URL,
  PAPER_NAME
} from "@eto-press/platform/config"

const ROOT = join(__dirname, "..", "..", "..")
const read = (...parts: Array<string>): string =>
  readFileSync(join(ROOT, ...parts), "utf8")

describe("CLI reference matches the verb registry", () => {
  const registry = read("packages", "cli", "bin", "eto.mjs")
  const verbsInCode = [...registry.matchAll(/^\s+"?([a-z][a-z-]*)"?: \["@eto-press\/press\//gm)]
    .map((m) => m[1]!)
  const doc = read("docs-site", "content", "docs", "reference", "cli.mdx")
  const verbsInDoc = [...new Set([...doc.matchAll(/`eto ([a-z][a-z-]*)/g)].map((m) => m[1]!))]

  it("found a plausible registry", () => {
    expect(verbsInCode.length).toBeGreaterThanOrEqual(10)
  })

  it("documents every verb the CLI has", () => {
    for (const verb of verbsInCode) expect(doc, `verb "${verb}" undocumented`).toContain(`eto ${verb}`)
  })

  it("documents no verb the CLI lacks", () => {
    for (const verb of verbsInDoc) {
      expect(verbsInCode, `doc invents verb "${verb}"`).toContain(verb)
    }
  })
})

describe("configuration reference matches config.ts defaults", () => {
  const doc = read("docs-site", "content", "docs", "reference", "configuration.mdx")

  it("quotes the real model defaults", () => {
    expect(doc).toContain(MATCH_MODEL)
    expect(doc).toContain(COMPOSITE_MODEL)
    expect(doc).toContain(OLLAMA_URL)
  })

  it("quotes the real paper defaults", () => {
    expect(doc).toContain(PAPER_NAME)
    expect(doc).toContain(ACCENT)
    expect(doc).toContain(`"${ENGINE}"`)
  })

  it("quotes the real mail and backup defaults", () => {
    expect(doc).toContain(MAIL.region)
    expect(doc).toContain(MAIL.contactList)
    expect(doc).toContain(MAIL.configSet)
    expect(doc).toContain(String(BACKUP.keep))
  })
})

describe("error reference matches the tagged errors", () => {
  const source = read("packages", "platform", "src", "errors.ts")
  const errorsInCode = [...source.matchAll(/class (\w+) extends Data\.TaggedError/g)]
    .map((m) => m[1]!)
  const doc = read("docs-site", "content", "docs", "reference", "errors.mdx")
  // Outcomes documented beside the errors but defined elsewhere.
  const notErrors = new Set(["NoEdition", "NothingToPrint"])
  const namesInDoc = [...new Set([...doc.matchAll(/`([A-Z][A-Za-z]+)`/g)].map((m) => m[1]!))]
    .filter((n) => !notErrors.has(n))

  it("found the error catalog", () => {
    expect(errorsInCode.length).toBeGreaterThanOrEqual(10)
  })

  it("documents every error the code can raise", () => {
    for (const name of errorsInCode) {
      expect(doc, `error "${name}" undocumented`).toContain(`\`${name}\``)
    }
  })

  it("documents no error the code lacks", () => {
    for (const name of namesInDoc) {
      expect(errorsInCode, `doc invents error "${name}"`).toContain(name)
    }
  })
})

describe("anatomy reference matches the markup and theme", () => {
  const html = read("packages", "platform", "src", "html.ts")
  const theme = read("packages", "press", "src", "brief.css")
  const doc = read("docs-site", "content", "docs", "reference", "anatomy.mdx")

  const classesInDoc = [...new Set(
    [...doc.matchAll(/`([a-z][a-z-]*(?:__[a-z-]+)?(?:--[a-z-]+)?)`/g)].map((m) => m[1]!)
  )].filter((c) => /(__|--)/.test(c) || /^(prose|instrument|accent|link|page|masthead|story|fold|report|cards|card|about|subscribe|honeypot|spectrum|corrections|edition)/.test(c))

  const classesInTheme = [...new Set(
    [...theme.matchAll(/^\.([a-z][a-z_-]+)/gm)].map((m) => m[1]!)
  )]

  it("every documented class exists in the markup or the theme", () => {
    for (const cls of classesInDoc) {
      const present = html.includes(cls) || theme.includes(`.${cls}`)
      expect(present, `documented class "${cls}" not found in html.ts or brief.css`).toBe(true)
    }
  })

  it("every themed class is documented", () => {
    for (const cls of classesInTheme) {
      expect(doc, `theme class "${cls}" undocumented`).toContain(cls)
    }
  })
})
