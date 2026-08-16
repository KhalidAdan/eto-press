import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { BriefUnverifiable } from "../src/errors.js"

describe("BriefUnverifiable", () => {
  it("is a tagged error carrying the cluster and its violations", () => {
    const err = new BriefUnverifiable({
      clusterHash: "abc123",
      violations: ["quote not found verbatim", "entity not in any account"]
    })
    expect(err._tag).toBe("BriefUnverifiable")
    expect(err.clusterHash).toBe("abc123")
    expect(err.violations).toHaveLength(2)
  })

  it("is catchable story-locally by tag, the way the engine uses it", () => {
    const recovered = Effect.runSync(
      new BriefUnverifiable({ clusterHash: "abc123", violations: ["x"] }).pipe(
        Effect.catchTag("BriefUnverifiable", (err) =>
          Effect.succeed(`dropped: ${err.violations.length} violation(s)`)
        )
      )
    )
    expect(recovered).toBe("dropped: 1 violation(s)")
  })
})
