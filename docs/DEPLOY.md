# Deploying the newsstand (eto.news on Cloudflare Pages)

The division of labor, per NORTH-STAR §10: the **press** is the editor's
machine — models, feeds, judgment, composition all happen there and only
there. GitHub is the **loading dock** (the repo carries the finished
`site/` directory). Cloudflare Pages is the **newsstand** — it serves
static files and does nothing else. No zip step exists because none is
needed: wrangler uploads the directory as-is.

Daily flow, once set up:

```
npm run dev      # print the edition (your machine, your models)
npm run render   # dress it in HTML (site/)
git add -A && git commit -m "the YYYY-MM-DD edition" && git push
                 # GitHub Action deploys site/ to eto.news
```

## One-time setup (editor's hands required)

1. **Cloudflare Pages project.** Cloudflare dashboard → Workers & Pages →
   Create → Pages → *Direct Upload*. Name it exactly `eto-news` (the
   workflow references this name). Upload anything for the first deploy —
   the Action replaces it.
2. **API token.** Cloudflare dashboard → My Profile → API Tokens → Create
   Token → custom, with permission **Cloudflare Pages: Edit** on your
   account. Copy the token.
3. **Account ID.** On the dashboard's overview page, right sidebar.
4. **GitHub secrets.** Repo → Settings → Secrets and variables → Actions →
   add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
5. **The domain.** In the Pages project → Custom domains → add `eto.news`.
   If the domain's DNS is on Cloudflare, this is one click; otherwise
   follow the CNAME instructions shown.
6. Push any change under `site/` (or run the workflow manually from the
   Actions tab) and watch it land.

## Alternative considered

Cloudflare Pages can also watch the GitHub repo directly (git integration,
no Action, output directory `site`, no build command). Fewer moving parts,
but the Action keeps the deploy step visible, versioned, and swappable —
and keeps Cloudflare's build machinery out of a project that deliberately
has no build. Either works; the workflow is what's wired.

## What is deliberately absent

No analytics, no cookies, no client-side JavaScript, no comment system.
The site is finite pages that end, exactly like the paper. Feedback for
the trial period is the GitHub repo's issues page.
