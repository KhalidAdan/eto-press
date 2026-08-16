import { describe, expect, it } from "vitest"
import { parseEntry } from "../src/engine.js"

describe("parseEntry", () => {
  it("takes the first heading as the headline and the rest as body", () => {
    const parsed = parseEntry({
      file: "2026-08-16-quiet.md",
      content: "# On quiet days\n\nSome mornings there is nothing to add.\n\nThat is fine."
    })
    expect(parsed.headline).toBe("On quiet days")
    expect(parsed.body).toBe("Some mornings there is nothing to add.\n\nThat is fine.")
  })

  it("derives a headline from the filename when no heading exists", () => {
    const parsed = parseEntry({
      file: "2026-08-16-on-the-weather.md",
      content: "It rained. We watched."
    })
    expect(parsed.headline).toBe("on the weather")
    expect(parsed.body).toBe("It rained. We watched.")
  })

  it("tolerates a heading below leading front matter or blank lines", () => {
    const parsed = parseEntry({
      file: "note.md",
      content: "\n\n# A late heading\nBody here."
    })
    expect(parsed.headline).toBe("A late heading")
    expect(parsed.body).toBe("Body here.")
  })
})
