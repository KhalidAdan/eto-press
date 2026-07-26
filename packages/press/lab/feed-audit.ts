/**
 * Front-door audit of candidate feeds (NORTH-STAR §8): fetch with eto's
 * honest user-agent, parse, count items, report. Candidates chosen to
 * deepen the masthead's benches; AllSides v11.3 ratings noted for the
 * editor's consideration. Run: npx tsx lab/feed-audit.ts
 */
import Parser from "rss-parser"

const UA = "eto/0.1 (+local news compositor; front-door reader)"

const CANDIDATES: Array<{ outlet: string; allsides: string; url: string }> = [
  // Right / Lean Right — the thin bench
  { outlet: "FOX News (US)", allsides: "Right", url: "https://moxie.foxnews.com/google-publisher/us.xml" },
  { outlet: "NY Post (news)", allsides: "Right", url: "https://nypost.com/news/feed/" },
  { outlet: "NY Post (politics)", allsides: "Right", url: "https://nypost.com/politics/feed/" },
  { outlet: "Washington Times (politics, retest)", allsides: "Lean Right", url: "https://www.washingtontimes.com/rss/headlines/news/politics/" },
  { outlet: "Washington Times (national)", allsides: "Lean Right", url: "https://www.washingtontimes.com/rss/headlines/news/national/" },
  { outlet: "Washington Examiner", allsides: "Lean Right", url: "https://www.washingtonexaminer.com/feed/" },
  { outlet: "Daily Caller", allsides: "Right", url: "https://dailycaller.com/feed/" },
  { outlet: "Daily Wire", allsides: "Right", url: "https://www.dailywire.com/feeds/rss.xml" },
  { outlet: "National Review", allsides: "Lean Right (news)", url: "https://www.nationalreview.com/feed/" },
  { outlet: "The Federalist", allsides: "Right", url: "https://thefederalist.com/feed/" },
  { outlet: "Newsmax", allsides: "Right", url: "https://www.newsmax.com/rss/Newsfront/16/" },
  { outlet: "The Dispatch", allsides: "Lean Right", url: "https://thedispatch.com/feed/" },
  { outlet: "Blaze Media", allsides: "Right", url: "https://www.theblaze.com/feeds/feed.rss" },
  // Lean Left / Left — depth
  { outlet: "NPR (politics)", allsides: "Lean Left", url: "https://feeds.npr.org/1014/rss.xml" },
  { outlet: "NPR (world)", allsides: "Lean Left", url: "https://feeds.npr.org/1004/rss.xml" },
  { outlet: "The Atlantic", allsides: "Left", url: "https://www.theatlantic.com/feed/all/" },
  { outlet: "Vox", allsides: "Left", url: "https://www.vox.com/rss/index.xml" },
  { outlet: "HuffPost", allsides: "Left", url: "https://chaski.huffpost.com/us/auto/vertical/front-page" },
  // Center — depth
  { outlet: "Christian Science Monitor", allsides: "Center", url: "https://rss.csmonitor.com/feeds/all" },
  { outlet: "Newsweek", allsides: "Center", url: "https://www.newsweek.com/rss" },
  { outlet: "WSJ (world news)", allsides: "Center (news)", url: "https://feeds.content.dowjones.io/public/rss/RSSWorldNews" }
]

const parser = new Parser()

for (const c of CANDIDATES) {
  const started = Date.now()
  try {
    const res = await fetch(c.url, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(15_000),
      redirect: "follow"
    })
    if (!res.ok) {
      console.log(`CLOSED  ${c.outlet.padEnd(36)} HTTP ${res.status}`)
      continue
    }
    const xml = await res.text()
    const feed = await parser.parseString(xml)
    const items = feed.items?.length ?? 0
    const withDates = feed.items?.filter((i) => i.isoDate ?? i.pubDate).length ?? 0
    const newest = feed.items?.[0]?.isoDate ?? feed.items?.[0]?.pubDate ?? "?"
    console.log(
      `OPEN    ${c.outlet.padEnd(36)} ${String(items).padStart(3)} items ` +
        `(${withDates} dated, newest ${String(newest).slice(0, 16)}, ${Date.now() - started}ms) [${c.allsides}]`
    )
  } catch (e) {
    console.log(`FAILED  ${c.outlet.padEnd(36)} ${String(e).slice(0, 60)}`)
  }
  await new Promise((r) => setTimeout(r, 300))
}
