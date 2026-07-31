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

  // The 2026-07-31 mega-cluster: every glue item below is real, from that
  // morning's corpus. Digests and uncaught liveblogs welded five storylines
  // into one 105-item front-page blob.

  it("catches named daily digests (2026-07-31 glue)", () => {
    expect(classify("Morning news brief", "https://www.npr.org/2026/07/31/nx-s1-5916554/morning-news-brief")).toBe("digest")
    expect(
      classify(
        "First Thing: US government borrowing costs hit new high as US strikes resume on Iran",
        "https://www.theguardian.com/us-news/2026/jul/31/first-thing"
      )
    ).toBe("digest")
    expect(
      classify(
        "Wednesday briefing: Will Zelenskyy’s domestic struggles harm his reputation on the global stage?",
        "https://www.theguardian.com/world/2026/jul/29/wednesday-briefing"
      )
    ).toBe("digest")
    expect(
      classify(
        "Trump’s warning becomes reality after Iran's failed attack and more top headlines",
        "https://www.foxnews.com/us/trump-warning-becomes-reality-top-headlines"
      )
    ).toBe("digest")
  })

  it("catches two-story semicolon headlines with disjoint subjects", () => {
    expect(
      classify(
        "US hits Iran after promised retaliation; GOP senators delay Blanche nomination",
        "https://san.com/cc/us-hits-iran-after-promised-retaliation"
      )
    ).toBe("digest")
    expect(
      classify(
        "Iran’s surprise attack fails; Fauci returns to Capitol Hill as diaries take center stage",
        "https://san.com/cc/irans-surprise-attack-fails"
      )
    ).toBe("digest")
  })

  it("keeps single-story semicolon headlines as news", () => {
    // Second clause names no new subject — one story, two beats.
    expect(
      classify(
        "Kumamoto earthquake death toll climbs to 13; rescue efforts continue",
        "https://www.upi.com/Top_News/World-News/2026/07/30/kumamoto"
      )
    ).toBe("news")
    // HTML-entity semicolons (&#039;) are not clause boundaries.
    expect(
      classify(
        "Tom Holland Says &#039;Spider-Man: Brand New Day&#039; Tackles Loneliness",
        "https://www.newsweek.com/tom-holland-spider-man"
      )
    ).toBe("news")
  })

  it("catches Guardian-style trailing liveblogs and topic-live prefixes", () => {
    expect(
      classify(
        "UK petrol prices expected to rise to highest this year as US attacks Iran – business live",
        "https://www.theguardian.com/business/live/2026/jul/31/petrol"
      )
    ).toBe("liveblog")
    expect(
      classify(
        "Iran war live: IRGC claims ‘retaliatory attack’ on Kuwait",
        "https://www.aljazeera.com/news/liveblog/2026/7/31/iran-war-live"
      )
    ).toBe("liveblog")
    expect(
      classify(
        "Middle East crisis live: Hamas will hand over weapons to new Gaza administration, says official, but deal depends on Israeli withdrawal",
        "https://www.theguardian.com/world/live/2026/jul/31/middle-east"
      )
    ).toBe("liveblog")
  })

  it("does not flag news that merely mentions live", () => {
    expect(
      classify(
        "Empty seats? Concert giant Live Nation says ticket sales are actually at record levels.",
        "https://www.marketwatch.com/story/live-nation-tickets"
      )
    ).toBe("news")
    expect(
      classify(
        "'I pay £580 a month to live in a disused care home': Property guardians show us around",
        "https://www.bbc.co.uk/news/articles/care-home-guardians"
      )
    ).toBe("news")
  })
})
