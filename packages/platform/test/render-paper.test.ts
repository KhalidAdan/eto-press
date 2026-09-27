/**
 * Generation 3: the archive renders a paper of sections. The contract
 * under test is the compatibility promise — a paper with one section and
 * nothing absent renders exactly what generation 2 rendered — and the
 * shape of a sectioned page: each desk labeled, headings one level down,
 * absences printed, one report.
 */
import { describe, expect, it } from "vitest"
import { editionStoryFrom, type EditionStory, type RunReport } from "../src/edition.js"
import { renderBrief, renderPaper } from "../src/render.js"

const story = (headline: string, body = "Body."): EditionStory =>
  editionStoryFrom({
    headline,
    body,
    differ: "",
    sourcesLine: "",
    balanceNote: null,
    foldReason: null,
    linkByOutlet: new Map()
  })

const report: RunReport = {
  feedOutcomes: [
    { outlet: "A", url: "https://a/rss", status: "ok", itemsKept: 3, ms: 10, detail: null }
  ],
  dropped: [],
  healthLines: ["Printed from the desk: 2 entries."]
}

/** The generation-2 renderer, transcribed: what renderBrief produced
 * before sections existed, for the fixture below. */
const generation2 = (runId: string, stories: ReadonlyArray<EditionStory>): string => {
  const longDate = new Date(`${runId}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  })
  const parts = [`# your paper — ${longDate}`, "", "*Write your masthead in eto.toml.*", ""]
  for (const s of stories) {
    parts.push("---", "", `## ${s.headline}`, "", s.body, "", "")
  }
  parts.push("---", "", "## The run, reported", "")
  parts.push("- Feeds read: 1 of 1")
  parts.push("- Printed from the desk: 2 entries.")
  parts.push("", "*The brief ends here.*", "")
  return parts.join("\n")
}

describe("renderPaper, one section", () => {
  const stories = [story("First"), story("Second")]

  it("renders byte-for-byte what generation 2 rendered", () => {
    const paper = renderPaper({
      runId: "2026-09-26",
      sections: [{ slug: "brief", name: "Brief", stories, report, advisoryLines: [] }],
      absent: [],
      corrections: []
    })
    expect(paper).toBe(generation2("2026-09-26", stories))
  })

  it("renderBrief is the same page through the old signature", () => {
    expect(renderBrief({ runId: "2026-09-26", stories, corrections: [] }, report)).toBe(
      generation2("2026-09-26", stories)
    )
  })

  it("never prints a section heading or an absence block", () => {
    const paper = renderPaper({
      runId: "2026-09-26",
      sections: [{ slug: "brief", name: "Brief", stories, report, advisoryLines: [] }],
      absent: [],
      corrections: []
    })
    expect(paper).not.toContain("## Brief")
    expect(paper).not.toContain("Not printed")
  })
})

describe("renderPaper, several sections", () => {
  const paper = renderPaper({
    runId: "2026-09-26",
    sections: [
      { slug: "brief", name: "Current events brief", stories: [story("Lead")], report, advisoryLines: [] },
      { slug: "sports", name: "Sports", stories: [story("Raptors win")], report, advisoryLines: ["a note"] }
    ],
    absent: [{ slug: "blogs", name: "Blogs", reason: "no new posts" }],
    corrections: []
  })

  it("labels each desk and steps story headings down a level", () => {
    expect(paper).toContain("## Current events brief")
    expect(paper).toContain("### Lead")
    expect(paper).toContain("## Sports")
    expect(paper).toContain("### Raptors win")
    expect(paper).not.toMatch(/^## Lead$/m)
  })

  it("says where each desk ends, and prints the absence", () => {
    expect(paper).toContain("*Current events brief ends here.*")
    expect(paper).toContain("*Sports ends here.*")
    expect(paper).toContain("## Not printed this morning")
    expect(paper).toContain("- Blogs: no new posts")
  })

  it("reports once, each line prefixed by its section", () => {
    expect(paper.match(/## The run, reported/g)).toHaveLength(1)
    expect(paper).toContain("- Sports: Feeds read: 1 of 1")
    expect(paper).toContain("- Sports: Advisories (recorded, not enforced):")
    expect(paper).toContain("- Blogs: did not print — no new posts")
  })

  it("ends as a paper, not a brief", () => {
    expect(paper.trimEnd().endsWith("*The paper ends here.*")).toBe(true)
  })
})

describe("renderPaper, one section with an absence", () => {
  it("is a sectioned page: the silence is printed, not hidden", () => {
    const paper = renderPaper({
      runId: "2026-09-26",
      sections: [{ slug: "brief", name: "Brief", stories: [story("Lead")], report, advisoryLines: [] }],
      absent: [{ slug: "sports", name: "Sports", reason: "off-season" }],
      corrections: []
    })
    expect(paper).toContain("## Brief")
    expect(paper).toContain("- Sports: off-season")
  })
})
