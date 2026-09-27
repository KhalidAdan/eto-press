/**
 * Docs-accuracy tests: the documentation site's reference pages are pinned
 * to the code they document. Documentation that drifts fails CI here, not
 * in front of a reader.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs"
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
  const notErrors = new Set(["NoEdition"])
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
  // The markup is two modules since generation 3: the pages, and the
  // index dialect they embed.
  const html =
    read("packages", "platform", "src", "html.ts") +
    read("packages", "platform", "src", "index-dialect.ts")
  const theme = read("packages", "platform", "src", "brief.css")
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

describe("the engine registry matches the pages that enumerate engines", () => {
  const registry = read("packages", "press", "src", "engines.ts")
  const enginesInCode = [...registry.matchAll(/^\s+([a-z]+): [a-z]+Engine,?$/gm)].map((m) => m[1]!)

  it("found a plausible registry", () => {
    expect(enginesInCode.length).toBeGreaterThanOrEqual(2)
  })

  for (const page of [
    ["docs-site", "content", "docs", "concepts", "engines.mdx"],
    ["docs-site", "content", "docs", "internals", "architecture.mdx"],
    ["docs", "CHANGELOG-GEN2.md"]
  ]) {
    it(`${page[page.length - 1]} names every registered engine`, () => {
      const doc = read(...page)
      for (const name of enginesInCode) {
        expect(doc, `engine "${name}" absent from ${page.join("/")}`).toMatch(
          new RegExp(`\\b${name}\\b`)
        )
      }
    })
  }
})

describe("the package roster matches what ships", () => {
  const packages = readdirSync(join(ROOT, "packages")).filter((p) =>
    existsSync(join(ROOT, "packages", p, "package.json"))
  )

  it("every package publishes a README", () => {
    for (const p of packages) {
      expect(existsSync(join(ROOT, "packages", p, "README.md")), `packages/${p}/README.md missing`).toBe(true)
    }
  })

  it("the root README's package table names every package", () => {
    const readme = read("README.md")
    for (const p of packages) {
      expect(readme, `@eto-press/${p} absent from README.md`).toContain(`@eto-press/${p}`)
    }
  })

  it("every package is at the same version", () => {
    const versions = new Set(
      packages.map((p) => (JSON.parse(read("packages", p, "package.json")) as { version: string }).version)
    )
    expect([...versions]).toHaveLength(1)
  })
})
