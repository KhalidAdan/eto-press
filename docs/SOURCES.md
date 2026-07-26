# The Source Catalog

Every outlet on the AllSides Media Bias Chart v11.3, audited through the
front door (NORTH-STAR §8) on **2026-07-25** from this machine, with eto's
honest user-agent. Ratings are AllSides', captured the same day — they are a
cartographer's opinion, not eto's and not necessarily yours. The active
masthead is `sources.toml`; this file is the shelf you stock it from.

Raw audit data: `lab/output/feed-audit-full.json`. Re-audit any time with
`npx tsx lab/feed-audit-full.ts`.

**Caveats.** An open feed is not a readable article: paywalled outlets (WSJ,
NYT, The Atlantic, The Economist…) may serve full headlines but teaser-only
article pages, in which case stage 7 drops their accounts and they contribute
clustering signal, never composite text. The `articles` table measures this
per outlet over time — check it before judging a source's worth. Feeds also
break and un-break (Washington Times served this machine at 20:00 and 403'd
by 21:51); status here is a snapshot, and `feed_fetches` is the running
health record.

## Left

| Outlet | Feed | Status (items) |
|---|---|---|
| AlterNet | https://www.alternet.org/feeds/feed.rss | open (30) |
| Daily Beast | https://www.thedailybeast.com/arc/outboundfeeds/rss/ | open (25) |
| Democracy Now! | https://www.democracynow.org/democracynow.rss | open (48) |
| HuffPost | https://www.huffpost.com/section/front-page/feed | **feed parses but 0 items** |
| Jacobin | https://jacobin.com/feed | open (20) |
| Mother Jones | https://www.motherjones.com/feed/ | open (10) |
| Slate | https://slate.com/feeds/all.rss | open (25) |
| The Atlantic | https://www.theatlantic.com/feed/all/ | open (25) — metered paywall |
| The Guardian (us) | https://www.theguardian.com/us-news/rss | open (33) |
| The Guardian (world) | https://www.theguardian.com/world/rss | open (45) |
| The Intercept | https://theintercept.com/feed/?rss | open (20) |
| The Nation | https://www.thenation.com/feed/?post_type=article | open (50) |
| The New Yorker | https://www.newyorker.com/feed/everything | open (50) — paywall |
| MS NOW | https://www.msnbc.com/feeds/latest | **malformed XML** |

## Lean Left

| Outlet | Feed | Status (items) |
|---|---|---|
| ABC News | https://abcnews.go.com/abcnews/topstories | open (25) |
| Al Jazeera | https://www.aljazeera.com/xml/rss/all.xml | open (25) — AllSides: Lean Left |
| Associated Press | https://feedx.net/rss/ap.xml | open (10) — **unofficial mirror**, AP has no public RSS |
| Axios | https://api.axios.com/feed/ | open (100) |
| Business Insider | https://feeds.businessinsider.com/custom/all | open (20) |
| CBS News | https://www.cbsnews.com/latest/rss/main | open (30) |
| CNBC | https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114 | open (30) |
| CNN Digital | http://rss.cnn.com/rss/cnn_topstories.rss | open (53) — article pages 451'd a hosted fetcher; untested from here |
| NBC News | https://feeds.nbcnews.com/nbcnews/public/news | open (19) |
| New York Times | https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml | open (16) — paywall |
| NPR (news) | https://feeds.npr.org/1001/rss.xml | open (10) — articles via text.npr.org |
| NPR (politics) | https://feeds.npr.org/1014/rss.xml | open (10) |
| NPR (world) | https://feeds.npr.org/1004/rss.xml | open (10) |
| Politico | https://rss.politico.com/politics-news.xml | open (30) |
| ProPublica | https://www.propublica.org/feeds/propublica/main | open (20) |
| Semafor | https://www.semafor.com/rss.xml | open (261) |
| The Economist | https://www.economist.com/latest/rss.xml | open (300) — hard paywall |
| Time Magazine | https://time.com/feed/ | open (25) |
| USA TODAY | http://rssfeeds.usatoday.com/usatoday-NewsTopStories | **malformed XML** |
| Washington Post (politics) | https://feeds.washingtonpost.com/rss/politics | open (5) — paywall, shallow feed |
| Washington Post (world) | https://feeds.washingtonpost.com/rss/world | open (4) — paywall, shallow feed |

## Center

| Outlet | Feed | Status (items) |
|---|---|---|
| BBC News | https://feeds.bbci.co.uk/news/world/rss.xml | open (25) |
| Bloomberg | — | **no public RSS** |
| Christian Science Monitor | https://rss.csmonitor.com/feeds/all | open (10) |
| Forbes | — | **no public RSS** |
| MarketWatch | https://feeds.content.dowjones.io/public/rss/mw_topstories | open (10) |
| NewsNation | https://www.newsnationnow.com/feed/ | open (12) |
| Newsweek | https://www.newsweek.com/rss | open (20) |
| Reason | https://reason.com/latest/feed/ | open (48) — libertarian per AllSides |
| Reuters | — | **no public RSS** (retired 2020; site also blocks hosted fetchers) |
| Straight Arrow News | https://san.com/feed/ | open (20) |
| The Hill | https://thehill.com/homenews/feed/ | open (15) — article pages 403 hosted fetchers; fine from here |
| WSJ (us) | https://feeds.content.dowjones.io/public/rss/RSSUSnews | open (40) — paywall |
| WSJ (world) | https://feeds.content.dowjones.io/public/rss/RSSWorldNews | open (72) — paywall |

## Lean Right

| Outlet | Feed | Status (items) |
|---|---|---|
| Daily Mail | https://www.dailymail.co.uk/articles.rss | open (140) — tabloid volume |
| Fox Business | https://moxie.foxbusiness.com/google-publisher/latest.xml | open (25) |
| Just The News | https://justthenews.com/rss.xml | open (20) |
| National Review | https://www.nationalreview.com/feed/ | open (20) |
| RealClearPolitics | https://www.realclearpolitics.com/index.xml | open (21) — aggregator: links out to other outlets |
| The American Conservative | https://www.theamericanconservative.com/feed/ | open (10) |
| The Dispatch | https://thedispatch.com/feed/ | open (10) |
| The Epoch Times | https://www.theepochtimes.com/feed | **HTTP 404** — feed moved or retired |
| The Free Press | https://www.thefp.com/feed | open (20) |
| Washington Examiner | https://www.washingtonexaminer.com/feed/ | open (10) |
| Washington Times | https://www.washingtontimes.com/rss/headlines/news/politics/ | **HTTP 403** — worked at 20:00, closed by 21:51 |
| ZeroHedge | https://feeds.feedburner.com/zerohedge/feed | open (25) |

## Right

| Outlet | Feed | Status (items) |
|---|---|---|
| Blaze Media | https://www.theblaze.com/feeds/feed.rss | open (30) |
| Breitbart News | https://feeds.feedburner.com/breitbart | open (49) |
| CBN | https://www1.cbn.com/rss-cbn-articles-cbnnews.xml | open (25) |
| Fox News (politics) | https://moxie.foxnews.com/google-publisher/politics.xml | open (25) |
| Fox News (us) | https://moxie.foxnews.com/google-publisher/us.xml | open (25) |
| Fox News (world) | https://moxie.foxnews.com/google-publisher/world.xml | open (~5 in window) |
| Independent Journal Review | https://ijr.com/feed/ | open (20) |
| New York Post (news) | https://nypost.com/news/feed/ | open (20) |
| New York Post (politics) | https://nypost.com/politics/feed/ | open (20) |
| Newsmax | https://www.newsmax.com/rss/Newsfront/16/ | open (20) |
| One America News | https://www.oann.com/feed/ | open (6) |
| The American Spectator | https://spectator.org/feed/ | open (10) |
| The Daily Caller | https://dailycaller.com/feed/ | open (25) |
| The Daily Wire | https://www.dailywire.com/feeds/rss.xml | open (50) |
| The Federalist | https://thefederalist.com/feed/ | open (20) |
| The Post Millennial | https://thepostmillennial.com/feed | **malformed response** |
| Washington Free Beacon | https://freebeacon.com/feed/ | open (20) |
