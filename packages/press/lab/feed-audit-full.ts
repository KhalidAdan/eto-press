/**
 * Exhaustive front-door audit: every outlet on the AllSides Media Bias
 * Chart v11.3 (featured list, captured 2026-07-25), with best-known feed
 * URLs. Writes lab/output/feed-audit-full.json for catalog generation.
 * Run: npx tsx lab/feed-audit-full.ts
 */
import { mkdirSync, writeFileSync } from "node:fs"
import Parser from "rss-parser"

const UA = "eto/0.1 (+local news compositor; front-door reader)"

// [outlet, AllSides rating, feed URL or null if no known public feed]
const CATALOG: Array<[string, string, string | null]> = [
  ["ABC News", "Lean Left", "https://abcnews.go.com/abcnews/topstories"],
  ["AlterNet", "Left", "https://www.alternet.org/feeds/feed.rss"],
  ["Associated Press", "Lean Left", "https://feedx.net/rss/ap.xml"],
  ["Axios", "Lean Left", "https://api.axios.com/feed/"],
  ["BBC News", "Center", "https://feeds.bbci.co.uk/news/world/rss.xml"],
  ["Blaze Media", "Right", "https://www.theblaze.com/feeds/feed.rss"],
  ["Bloomberg", "Center", null],
  ["Breitbart News", "Right", "https://feeds.feedburner.com/breitbart"],
  ["Business Insider", "Lean Left", "https://feeds.businessinsider.com/custom/all"],
  ["CBN", "Right", "https://www1.cbn.com/rss-cbn-articles-cbnnews.xml"],
  ["CBS News", "Lean Left", "https://www.cbsnews.com/latest/rss/main"],
  ["Christian Science Monitor", "Center", "https://rss.csmonitor.com/feeds/all"],
  ["CNBC", "Lean Left", "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114"],
  ["CNN Digital", "Lean Left", "http://rss.cnn.com/rss/cnn_topstories.rss"],
  ["Daily Beast", "Left", "https://www.thedailybeast.com/arc/outboundfeeds/rss/"],
  ["Daily Mail", "Lean Right", "https://www.dailymail.co.uk/articles.rss"],
  ["Democracy Now!", "Left", "https://www.democracynow.org/democracynow.rss"],
  ["Forbes", "Center", null],
  ["Fox Business", "Lean Right", "https://moxie.foxbusiness.com/google-publisher/latest.xml"],
  ["Fox News", "Right", "https://moxie.foxnews.com/google-publisher/politics.xml"],
  ["HuffPost", "Left", "https://www.huffpost.com/section/front-page/feed"],
  ["Independent Journal Review", "Right", "https://ijr.com/feed/"],
  ["Jacobin", "Left", "https://jacobin.com/feed"],
  ["Just The News", "Lean Right", "https://justthenews.com/rss.xml"],
  ["MarketWatch", "Center", "https://feeds.content.dowjones.io/public/rss/mw_topstories"],
  ["Mother Jones", "Left", "https://www.motherjones.com/feed/"],
  ["MS NOW", "Left", "https://www.msnbc.com/feeds/latest"],
  ["National Review", "Lean Right", "https://www.nationalreview.com/feed/"],
  ["NBC News", "Lean Left", "https://feeds.nbcnews.com/nbcnews/public/news"],
  ["New York Post (news)", "Right", "https://nypost.com/news/feed/"],
  ["New York Post (politics)", "Right", "https://nypost.com/politics/feed/"],
  ["New York Times", "Lean Left", "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml"],
  ["Newsmax", "Right", "https://www.newsmax.com/rss/Newsfront/16/"],
  ["NewsNation", "Center", "https://www.newsnationnow.com/feed/"],
  ["Newsweek", "Center", "https://www.newsweek.com/rss"],
  ["NPR (news)", "Lean Left", "https://feeds.npr.org/1001/rss.xml"],
  ["NPR (politics)", "Lean Left", "https://feeds.npr.org/1014/rss.xml"],
  ["NPR (world)", "Lean Left", "https://feeds.npr.org/1004/rss.xml"],
  ["One America News", "Right", "https://www.oann.com/feed/"],
  ["Politico", "Lean Left", "https://rss.politico.com/politics-news.xml"],
  ["ProPublica", "Lean Left", "https://www.propublica.org/feeds/propublica/main"],
  ["RealClearPolitics", "Lean Right", "https://www.realclearpolitics.com/index.xml"],
  ["Reason", "Center", "https://reason.com/latest/feed/"],
  ["Reuters", "Center", null],
  ["Semafor", "Lean Left", "https://www.semafor.com/rss.xml"],
  ["Slate", "Left", "https://slate.com/feeds/all.rss"],
  ["Straight Arrow News", "Center", "https://san.com/feed/"],
  ["The American Conservative", "Lean Right", "https://www.theamericanconservative.com/feed/"],
  ["The American Spectator", "Right", "https://spectator.org/feed/"],
  ["The Atlantic", "Left", "https://www.theatlantic.com/feed/all/"],
  ["The Daily Caller", "Right", "https://dailycaller.com/feed/"],
  ["The Daily Wire", "Right", "https://www.dailywire.com/feeds/rss.xml"],
  ["The Dispatch", "Lean Right", "https://thedispatch.com/feed/"],
  ["The Economist", "Lean Left", "https://www.economist.com/latest/rss.xml"],
  ["The Epoch Times", "Lean Right", "https://www.theepochtimes.com/feed"],
  ["The Federalist", "Right", "https://thefederalist.com/feed/"],
  ["The Free Press", "Lean Right", "https://www.thefp.com/feed"],
  ["The Guardian (us)", "Left", "https://www.theguardian.com/us-news/rss"],
  ["The Guardian (world)", "Left", "https://www.theguardian.com/world/rss"],
  ["The Hill", "Center", "https://thehill.com/homenews/feed/"],
  ["The Intercept", "Left", "https://theintercept.com/feed/?rss"],
  ["The Nation", "Left", "https://www.thenation.com/feed/?post_type=article"],
  ["The New Yorker", "Left", "https://www.newyorker.com/feed/everything"],
  ["The Post Millennial", "Right", "https://thepostmillennial.com/feed"],
  ["Time Magazine", "Lean Left", "https://time.com/feed/"],
  ["USA TODAY", "Lean Left", "http://rssfeeds.usatoday.com/usatoday-NewsTopStories"],
  ["Vox", "Left", "https://www.vox.com/rss/index.xml"],
  ["Wall Street Journal (world)", "Center", "https://feeds.content.dowjones.io/public/rss/RSSWorldNews"],
  ["Wall Street Journal (us)", "Center", "https://feeds.content.dowjones.io/public/rss/RSSUSnews"],
  ["Washington Examiner", "Lean Right", "https://www.washingtonexaminer.com/feed/"],
  ["Washington Free Beacon", "Right", "https://freebeacon.com/feed/"],
  ["Washington Post (politics)", "Lean Left", "https://feeds.washingtonpost.com/rss/politics"],
  ["Washington Post (world)", "Lean Left", "https://feeds.washingtonpost.com/rss/world"],
  ["Washington Times", "Lean Right", "https://www.washingtontimes.com/rss/headlines/news/politics/"],
  ["ZeroHedge", "Lean Right", "https://feeds.feedburner.com/zerohedge/feed"]
]

const parser = new Parser()
const results: Array<{
  outlet: string
  allsides: string
  url: string | null
  status: string
  items: number
  note: string
}> = []

for (const [outlet, allsides, url] of CATALOG) {
  if (url === null) {
    results.push({ outlet, allsides, url, status: "no-feed", items: 0, note: "no known public RSS" })
    console.log(`NOFEED  ${outlet.padEnd(30)} [${allsides}]`)
    continue
  }
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(15_000),
      redirect: "follow"
    })
    if (!res.ok) {
      results.push({ outlet, allsides, url, status: `HTTP ${res.status}`, items: 0, note: "" })
      console.log(`CLOSED  ${outlet.padEnd(30)} HTTP ${res.status} [${allsides}]`)
    } else {
      const feed = await parser.parseString(await res.text())
      const dated = feed.items?.filter((i) => i.isoDate ?? i.pubDate).length ?? 0
      const status = dated > 0 ? "open" : "empty"
      results.push({ outlet, allsides, url, status, items: dated, note: "" })
      console.log(`${status === "open" ? "OPEN  " : "EMPTY "}  ${outlet.padEnd(30)} ${String(dated).padStart(3)} items [${allsides}]`)
    }
  } catch (e) {
    results.push({ outlet, allsides, url, status: "error", items: 0, note: String(e).slice(0, 80) })
    console.log(`FAILED  ${outlet.padEnd(30)} ${String(e).slice(0, 50)}`)
  }
  await new Promise((r) => setTimeout(r, 300))
}

mkdirSync("lab/output", { recursive: true })
writeFileSync(
  "lab/output/feed-audit-full.json",
  JSON.stringify({ auditedAt: new Date().toISOString(), chart: "AllSides v11.3", results }, null, 2)
)
const open = results.filter((r) => r.status === "open").length
console.log(`\n${open}/${results.length} feeds open. Saved lab/output/feed-audit-full.json`)
