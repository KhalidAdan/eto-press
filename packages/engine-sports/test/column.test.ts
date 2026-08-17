import { describe, expect, it } from "vitest"
import { parseColumn } from "../src/engine.js"

describe("parseColumn", () => {
  it("reads headline, byline, and body", () => {
    const col = parseColumn({
      file: "monday.md",
      content: "# The dragon flies again\n\nby: Mark\n\nWhat a week for the blue dragon.\n\nMore prose."
    })
    expect(col.headline).toBe("The dragon flies again")
    expect(col.byline).toBe("Mark")
    expect(col.body).toBe("What a week for the blue dragon.\n\nMore prose.")
  })

  it("treats a column without a byline line as unsigned", () => {
    const col = parseColumn({
      file: "notes.md",
      content: "# Quick notes\n\nJust the facts today."
    })
    expect(col.byline).toBeNull()
    expect(col.body).toBe("Just the facts today.")
  })

  it("accepts 'By Name' capitalization and no colon", () => {
    const col = parseColumn({
      file: "col.md",
      content: "# A column\nBy Krystal Ball\nThe take."
    })
    expect(col.byline).toBe("Krystal Ball")
    expect(col.body).toBe("The take.")
  })

  it("derives a headline from the filename when there is no heading", () => {
    const col = parseColumn({ file: "off-season-notes.md", content: "Body only." })
    expect(col.headline).toBe("off season notes")
    expect(col.body).toBe("Body only.")
  })
})
