/**
 * Known-answer probes for item classification. Every title here is real,
 * taken from the experiment 002 run (lab/output/run-20260725-2053.json),
 * including the exact items that glued unrelated clusters together.
 */
import { describe, expect, it } from "vitest"
import { classify } from "../src/normalize.js"

describe("classify", () => {
  it("plain news is news", () => {
    expect(
      classify(
        "More than 250,000 flee wildfires in France and Spain",
        "https://www.bbc.co.uk/news/articles/cd7le0d53y2o"
      )
    ).toBe("news")
    expect(
      classify(
        "Democrats in Maine formally nominate Troy Jackson as their new candidate for U.S. Senate",
        "https://www.npr.org/2026/07/25/nx-s1-5902982/democrats-maine-senate-race"
      )
    ).toBe("news")
  })

  it("catches the cyclospora glue column (trailing byline)", () => {
    expect(
      classify(
        "I tried so hard to become a salad eater. Now cyclospora is sending me back to burgers | Dave Schilling",
        "https://www.theguardian.com/wellness/2026/jul/24/cyclospora-salad"
      )
    ).toBe("opinion")
  })

  it("catches bylines with lowercase particles (found live: Claire de Lune)", () => {
    expect(
      classify(
        "LeBron James' final act is about more than basketball. It's about time | Claire de Lune",
        "https://www.theguardian.com/sport/2026/jul/25/lebron-james-76ers"
      )
    ).toBe("opinion")
  })

  it("catches commentisfree URLs regardless of title", () => {
    expect(
      classify(
        "If Trump really cares about forced labor, he should look at the US – rather than slap more tariffs on the world | Eduardo Porter",
        "https://www.theguardian.com/commentisfree/2026/jul/24/trump-tariffs"
      )
    ).toBe("opinion")
  })

  it("catches Watch: videos and trailing – video", () => {
    expect(
      classify(
        "Watch: Wildfires rage across Spain and France",
        "https://www.bbc.co.uk/news/videos/x"
      )
    ).toBe("video")
    expect(
      classify(
        "Donald Trump dons 'Trump 2028' hat and jokes about 'fourth term' – video",
        "https://www.theguardian.com/us-news/video/2026/jul/25/trump-whcd"
      )
    ).toBe("video")
  })

  it("catches podcasts", () => {
    expect(
      classify(
        "The 'cockroaches' marching on India's government – podcast",
        "https://www.theguardian.com/news/audio/2026/jul/24/cockroach-podcast"
      )
    ).toBe("podcast")
  })

  it("catches liveblogs", () => {
    expect(
      classify(
        "Live updates: Troy Jackson takes Platner's place in Maine Senate race; Middle East conflict persists",
        "https://thehill.com/homenews/campaign/5989977-live-updates"
      )
    ).toBe("liveblog")
    expect(
      classify(
        "France and Spain race to control wildfires as more than 250,000 evacuated – as it happened",
        "https://www.theguardian.com/world/live/2026/jul/25/wildfires"
      )
    ).toBe("liveblog")
  })

  it("does not flag news titles containing quoted pipes or Watch mid-title", () => {
    expect(
      classify(
        "Trump orders Smithsonian to post warnings about 'inaccurate' US history",
        "https://www.bbc.co.uk/news/articles/c1w10gwnj74o"
      )
    ).toBe("news")
  })
})
