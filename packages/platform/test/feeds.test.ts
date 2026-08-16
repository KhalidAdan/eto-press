/**
 * Known-answer probes for stage 2b: feed-served full text. The positive
 * fixture mirrors Axios's feed (2026-07-31: content:encoded carries the
 * entire ~2k-char smart-brevity card while the article page blocks tools).
 */
import { describe, expect, it } from "vitest"
import { FEED_FULLTEXT_MIN, feedFullText } from "../src/feeds.js"

describe("feedFullText", () => {
  it("keeps substantial publisher-served content, stripped of markup", () => {
    const axiosLike =
      "<p>" +
      "President Trump is considering strikes on Iranian energy targets, four sources tell Axios. "
        .repeat(30) +
      "</p>"
    const text = feedFullText(axiosLike)
    expect(text).not.toBeNull()
    expect(text!).not.toContain("<p>")
    expect(text!.length).toBeGreaterThanOrEqual(FEED_FULLTEXT_MIN)
  })

  it("ignores teaser-length descriptions", () => {
    expect(
      feedFullText("<p>Senators clashed over the nomination on Thursday.</p>")
    ).toBeNull()
  })

  it("ignores absent content", () => {
    expect(feedFullText(undefined)).toBeNull()
  })

  it("caps runaway feed bodies at the stored-article limit", () => {
    const huge = "word ".repeat(10_000)
    expect(feedFullText(huge)!.length).toBeLessThanOrEqual(20_000)
  })
})
