import { describe, expect, it } from "vitest"
import { parseNomination } from "../src/nominate.js"

describe("parseNomination", () => {
  it("parses a clean nomination", () => {
    const p = parseNomination(
      "c12 — Over a million children lose food benefits when the program lapses next month."
    )
    expect(p).toEqual({
      id: "c12",
      reason:
        "Over a million children lose food benefits when the program lapses next month."
    })
  })

  it("tolerates chatty preamble and trailing lines", () => {
    const p = parseNomination(
      "Sure! My pick:\nc3 — A court ruling changes ballot access in 23 states.\nLet me know if..."
    )
    expect(p?.id).toBe("c3")
    expect(p?.reason).toBe("A court ruling changes ballot access in 23 states.")
  })

  it("rejects output with no id", () => {
    expect(parseNomination("The wildfire story deserves more attention.")).toBeNull()
  })

  it("rejects an empty echo of a reason", () => {
    expect(parseNomination("c7 — ok")).toBeNull()
  })
})
