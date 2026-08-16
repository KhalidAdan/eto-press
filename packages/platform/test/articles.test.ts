import { describe, expect, it } from "vitest"
import { mirrorUrl } from "../src/articles.js"

describe("mirrorUrl", () => {
  it("rewrites NPR article links to the text-only front door", () => {
    expect(
      mirrorUrl("https://www.npr.org/2026/07/25/nx-s1-5902982/democrats-maine-senate-race")
    ).toBe("https://text.npr.org/nx-s1-5902982")
  })

  it("leaves other outlets untouched", () => {
    expect(mirrorUrl("https://www.bbc.co.uk/news/articles/cd7le0d53y2o")).toBeNull()
    expect(mirrorUrl("https://www.foxnews.com/politics/some-story")).toBeNull()
  })
})
