/**
 * Generation 3: the section declaration. The compatibility rule is the
 * contract every existing paper relies on — no `[[section]]` blocks means
 * one section, printed by `[engine] use` from sources.toml.
 */
import { describe, expect, it } from "vitest"
import { DEFAULT_SECTION_SLUG, parseSections, SECTIONED, SECTIONS } from "../src/config.js"
import { deskDir } from "../src/desk.js"

describe("parseSections", () => {
  it("a paper with no [[section]] is one section on the fallback engine, from sources.toml", () => {
    const sections = parseSections({}, "eto")
    expect(sections).toHaveLength(1)
    expect(sections[0]).toMatchObject({
      slug: DEFAULT_SECTION_SLUG,
      engine: "eto",
      masthead: "sources.toml"
    })
  })

  it("honours [engine] use for the compatibility section", () => {
    expect(parseSections({}, "desk")[0]!.engine).toBe("desk")
  })

  it("reads declared sections in order, defaulting the source file to sections/<slug>.toml", () => {
    const sections = parseSections(
      {
        section: [
          { name: "Current events brief", slug: "brief", engine: "eto", masthead: "sources.toml" },
          { name: "Sports", slug: "sports", engine: "sports" },
          { slug: "blogs", engine: "digest" }
        ]
      },
      "eto"
    )
    expect(sections.map((s) => s.slug)).toEqual(["brief", "sports", "blogs"])
    expect(sections[0]!.masthead).toBe("sources.toml")
    expect(sections[1]!.masthead).toBe("sections/sports.toml")
    expect(sections[2]!.name).toBe("blogs")
  })

  it("refuses a slug that is not an address", () => {
    expect(() => parseSections({ section: [{ slug: "Sports Desk", engine: "sports" }] }, "eto")).toThrow(
      /slug/
    )
  })

  it("refuses two sections with one slug", () => {
    expect(() =>
      parseSections(
        { section: [{ slug: "a", engine: "desk" }, { slug: "a", engine: "digest" }] },
        "eto"
      )
    ).toThrow(/share the slug/)
  })

  it("refuses a section without an engine", () => {
    expect(() => parseSections({ section: [{ slug: "a" }] }, "eto")).toThrow(/names no engine/)
  })

  it("refuses an empty [[section]] list", () => {
    expect(() => parseSections({ section: [] }, "eto")).toThrow(/one or more/)
  })
})

describe("the neutral paper (no eto.toml in this package)", () => {
  it("is a single-section paper on the eto engine", () => {
    expect(SECTIONED).toBe(false)
    expect(SECTIONS).toHaveLength(1)
    expect(SECTIONS[0]!.engine).toBe("eto")
  })
})

describe("deskDir", () => {
  it("is desk/ on the compatibility paper and desk/<slug>/ once sectioned", () => {
    expect(deskDir(false, "brief")).toBe("desk")
    expect(deskDir(true, "sports")).toBe("desk/sports")
  })
})
