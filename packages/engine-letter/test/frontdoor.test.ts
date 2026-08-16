import { describe, expect, it } from "vitest"
import { capText, documentText, extractTitle } from "@eto-press/platform/frontdoor"

const PAGE = `<!doctype html><html><head>
<title>FOMC statement — August 2026</title>
<style>body { color: red }</style>
<script>console.log("tracking nobody")</script>
</head><body>
<nav><a href="/">Home</a><a href="/about">About</a></nav>
<h1>Federal Open Market Committee</h1>
<p>The Committee decided to maintain the target range.</p>
<footer>© an institution</footer>
</body></html>`

describe("document extraction", () => {
  it("takes the page's own title", () => {
    expect(extractTitle(PAGE)).toBe("FOMC statement — August 2026")
  })

  it("falls back to the first heading, then to nothing", () => {
    expect(extractTitle("<h1> A heading </h1><p>x</p>")).toBe("A heading")
    expect(extractTitle("<p>just prose</p>")).toBeNull()
  })

  it("drops script, style, nav, and footer noise from the prose", () => {
    const text = documentText(PAGE)
    expect(text).toContain("maintain the target range")
    expect(text).not.toContain("tracking nobody")
    expect(text).not.toContain("color: red")
    expect(text).not.toContain("About")
    expect(text).not.toContain("© an institution")
  })
})

describe("capText", () => {
  it("leaves short text alone", () => {
    expect(capText("short", 100)).toBe("short")
  })

  it("cuts on a word boundary with an honest marker", () => {
    const capped = capText("one two three four five", 13)
    expect(capped).toBe("one two […]")
  })
})
