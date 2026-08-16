/**
 * Release A contracts: the press's defaults are neutral (no eto.toml
 * present in this package during tests — that absence IS the fixture),
 * and the sources page asserts provenance only when the masthead
 * declares a [seed].
 */
import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import {
  BACKUP,
  MAIL,
  PAPER_MOTTO,
  PAPER_NAME,
  SITE_URL
} from "../src/config.js"
import { renderSourcesPage } from "../src/html.js"
import { MastheadSchema } from "../src/masthead.js"

describe("neutral defaults (no eto.toml)", () => {
  it("carries no real paper's identity", () => {
    expect(PAPER_NAME).toBe("your paper")
    expect(PAPER_MOTTO).toBe("Write your masthead in eto.toml.")
    expect(SITE_URL).toBe("http://localhost")
  })
  it("carries no mail identity — sending must be configured", () => {
    expect(MAIL.domain).toBe("")
    expect(MAIL.from).toBe("")
    expect(MAIL.fromFallback).toBe("")
  })
  it("carries no machine's drive layout", () => {
    expect(BACKUP.dir).toBe("backups")
  })
})

describe("sources-page provenance", () => {
  const bySide = [{ side: "center", outlets: ["Wire Service"] }]

  it("asserts nothing without a seed", () => {
    const html = renderSourcesPage(bySide, null)
    expect(html).not.toContain("seeded from")
    expect(html).not.toContain("AllSides")
  })

  it("renders the declared seed, linked and versioned", () => {
    const html = renderSourcesPage(bySide, {
      name: "AllSides Media Bias Chart",
      url: "https://www.allsides.com/media-bias/media-bias-chart",
      version: "v11.3",
      description: "which rates outlets from left to right"
    })
    expect(html).toContain("seeded from the")
    expect(html).toContain('href="https://www.allsides.com/media-bias/media-bias-chart"')
    expect(html).toContain("(v11.3)")
    expect(html).toContain("rates perspective, not accuracy")
  })

  it("escapes seed text", () => {
    const html = renderSourcesPage(bySide, { name: "<b>chart</b>" })
    expect(html).not.toContain("<b>chart</b>")
    expect(html).toContain("&lt;b&gt;chart&lt;/b&gt;")
  })
})

describe("masthead [seed] schema", () => {
  const decode = Schema.decodeUnknownSync(MastheadSchema)
  const base = { source: [{ name: "A", side: "center", feeds: ["https://a/rss"] }] }

  it("accepts a masthead without a seed", () => {
    expect(decode(base).seed).toBeUndefined()
  })
  it("accepts a full seed block", () => {
    const m = decode({ ...base, seed: { name: "AllSides", version: "v11.3" } })
    expect(m.seed?.name).toBe("AllSides")
  })
  it("rejects a seed without a name", () => {
    expect(() => decode({ ...base, seed: { version: "v11.3" } })).toThrow()
  })
})
