import { describe, expect, it } from "vitest"
import { valueAtPath } from "@eto-press/platform/frontdoor"
import { motionNote, parseDoor } from "../src/engine.js"

describe("parseDoor", () => {
  it("splits a fragment path from the door's url", () => {
    expect(parseDoor("https://api.example.org/rates.json#data.tenYear")).toEqual({
      url: "https://api.example.org/rates.json",
      path: "data.tenYear"
    })
  })

  it("treats a bare url as a whole-body value", () => {
    expect(parseDoor("https://example.org/spot.txt")).toEqual({
      url: "https://example.org/spot.txt",
      path: null
    })
  })
})

describe("valueAtPath", () => {
  it("walks a dot path into JSON", () => {
    expect(valueAtPath('{"data":{"tenYear":"4.12"}}', "data.tenYear")).toBe("4.12")
  })

  it("stringifies non-string leaves", () => {
    expect(valueAtPath('{"spot":4.12}', "spot")).toBe("4.12")
  })

  it("returns null for a missing path or non-JSON body with a path", () => {
    expect(valueAtPath('{"a":1}', "b.c")).toBeNull()
    expect(valueAtPath("plain text", "a")).toBeNull()
  })

  it("takes the whole trimmed body when no path is given", () => {
    expect(valueAtPath("  4.25\n", null)).toBe("4.25")
  })
})

describe("motionNote", () => {
  it("is silent on a first sighting and on no movement", () => {
    expect(motionNote("4.12", null)).toBeNull()
    expect(motionNote("4.12", "4.12")).toBeNull()
  })

  it("reports a signed numeric delta", () => {
    expect(motionNote("4.12", "4.25")).toBe("▼ -0.13 since last edition")
    expect(motionNote("102", "100")).toBe("▲ +2 since last edition")
  })

  it("falls back to an honest 'was' for non-numeric values", () => {
    expect(motionNote("Storm warning", "All clear")).toBe("was All clear")
  })
})
