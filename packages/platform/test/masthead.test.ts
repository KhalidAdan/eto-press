import { Effect } from "effect"
import * as TOML from "smol-toml"
import { describe, expect, it } from "vitest"
import { checkUnknownKeys } from "../src/masthead.js"
import { MastheadInvalid } from "../src/errors.js"

const parse = (toml: string) => TOML.parse(toml) as Record<string, unknown>

const CLEAN = `
below_the_fold = false

[[source]]
name = "The Guardian"
side = "lean-left"
feeds = ["https://example.org/rss"]
`

// The 2026-08-15 dry-run incident: a root flag appended after the last
// [[source]] belongs to that source in TOML, and the press ignored it.
const MISPLACED = `
[[source]]
name = "The Guardian"
side = "lean-left"
feeds = ["https://example.org/rss"]
below_the_fold = false
`

const ANNOTATED = `
editor_note = "trimmed 2026-08"

[[source]]
name = "The Guardian"
side = "lean-left"
feeds = ["https://example.org/rss"]
added = "2026-08-01"
`

describe("checkUnknownKeys", () => {
  it("accepts a clean masthead with a root-level flag", () => {
    expect(() =>
      Effect.runSync(checkUnknownKeys("sources.toml", parse(CLEAN)))
    ).not.toThrow()
  })

  it("refuses a masthead flag that TOML attached to a [[source]]", () => {
    const error = Effect.runSync(
      Effect.flip(checkUnknownKeys("sources.toml", parse(MISPLACED)))
    )
    expect(error).toBeInstanceOf(MastheadInvalid)
    expect(error.reason).toContain('"below_the_fold"')
    expect(error.reason).toContain("[[source]] #1")
    expect(error.reason).toContain("top of the file")
  })

  it("tolerates unknown annotation keys, at root and on sources", () => {
    expect(() =>
      Effect.runSync(checkUnknownKeys("sources.toml", parse(ANNOTATED)))
    ).not.toThrow()
  })
})
