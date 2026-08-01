/**
 * Audition a compositor candidate on real stories from the journal.
 * Run: npx tsx lab/composite-eval.ts <model> [runId]
 *
 * Takes the run's published stories, rebuilds each one's prompt exactly as
 * stage 8 would (same account selection, same template, same caps), asks the
 * candidate for a draft at temperature 0, and grades it with the PRODUCTION
 * parser and verifier. Writes lab/output/composite-eval-<model>.json with
 * the full drafts for hand-reading — the verifier catches fabricated quotes
 * and leaked entities, but only a human catches dull or subtly wrong prose.
 */
import Database from "better-sqlite3"
import { mkdirSync, writeFileSync } from "node:fs"
import type { Account } from "../src/articles.js"
import { parseDraft, selectAccountsForPrompt, sourcesLineFor } from "../src/composite.js"
import { OLLAMA_URL, COMPOSITE_NUM_CTX } from "../src/config.js"
import type { Item } from "../src/normalize.js"
import { compositePrompt } from "../src/prompts.js"
import { verifyDraft } from "../src/verify.js"

const model = process.argv[2]
if (!model) {
  console.error("usage: tsx lab/composite-eval.ts <model> [runId]")
  process.exit(1)
}
const runId = process.argv[3] ?? new Date().toISOString().slice(0, 10)

const db = new Database("db/eto.sqlite", { readonly: true })

interface StoryRow {
  cluster_hash: string
  rank: number
}
// Dropped stories are the interesting ones for a candidate audition — a
// writer that rescues what the incumbent lost is the point of the exercise.
const stories = db
  .prepare(
    `SELECT cluster_hash, rank FROM stories
     WHERE run_id = ? AND status IN ('published', 'dropped', 'selected')
     ORDER BY rank`
  )
  .all(runId) as Array<StoryRow>
if (stories.length === 0) {
  console.error(`no published stories for run ${runId}`)
  process.exit(1)
}

const accountsFor = (clusterHash: string): Array<Account> =>
  (
    db
      .prepare(
        `SELECT i.id, i.outlet, i.side, i.kind, i.title, i.summary, i.link,
                i.published_at, a.text
         FROM cluster_items ci
         JOIN items i ON i.id = ci.item_id
         JOIN articles a ON a.item_id = i.id AND a.status = 'ok'
         WHERE ci.run_id = ? AND ci.cluster_hash = ? AND a.text IS NOT NULL
         ORDER BY ci.rowid`
      )
      .all(runId, clusterHash) as Array<{
      id: number
      outlet: string
      side: string
      kind: string
      title: string
      summary: string
      link: string
      published_at: string
      text: string
    }>
  ).map((r) => ({
    item: {
      id: r.id,
      outlet: r.outlet,
      side: r.side,
      kind: r.kind as Item["kind"],
      title: r.title,
      summary: r.summary,
      link: r.link,
      publishedAt: new Date(r.published_at)
    },
    text: r.text
  }))

let thinkMode: "off" | "unsupported" | "unknown" = "unknown"

const ask = async (prompt: string): Promise<{ raw: string; ms: number }> => {
  const t0 = Date.now()
  const attempt = (withThink: boolean): Promise<Response> =>
    fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        stream: false,
        ...(withThink ? { think: false } : {}),
        options: { temperature: 0, num_ctx: COMPOSITE_NUM_CTX }
      })
    })
  let res = await attempt(thinkMode !== "unsupported")
  if (!res.ok && thinkMode === "unknown") {
    thinkMode = "unsupported"
    res = await attempt(false)
  } else if (res.ok && thinkMode === "unknown") {
    thinkMode = "off"
  }
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${await res.text()}`)
  const data = (await res.json()) as {
    message: { content: string; thinking?: string }
  }
  return { raw: data.message.content, ms: Date.now() - t0 }
}

// Production compositeStory does not strip <think> blocks; a model that
// leaks one into content would need an integration change. Grade the parse
// on the raw content so that cost is visible, but also record it.
const results: Array<unknown> = []
for (const s of stories) {
  const accounts = accountsFor(s.cluster_hash)
  if (accounts.length < 2) {
    console.log(`  story #${s.rank}: fewer than 2 accounts in journal, skipped`)
    continue
  }
  const promptAccounts = selectAccountsForPrompt(accounts)
  const prompt = compositePrompt(
    promptAccounts.map((a) => ({ outlet: a.item.outlet, title: a.item.title, text: a.text }))
  )
  const { raw, ms } = await ask(prompt)
  const leakedThink = /<think>/i.test(raw)
  const draft = parseDraft(raw, 0)
  const graded =
    draft === null
      ? null
      : verifyDraft({ ...draft, sourcesLine: sourcesLineFor(promptAccounts) }, promptAccounts)
  results.push({
    rank: s.rank,
    clusterHash: s.cluster_hash,
    outletsInPrompt: promptAccounts.map((a) => a.item.outlet),
    ms,
    leakedThink,
    parsed: draft !== null,
    violations: graded?.violations ?? null,
    advisories: graded?.advisories ?? null,
    headline: draft?.headline ?? null,
    raw
  })
  console.log(
    `  story #${s.rank}: ${draft === null ? "PARSE FAIL" : draft.headline.slice(0, 60)} ` +
      `(${(ms / 1000).toFixed(0)}s${leakedThink ? ", leaked <think>" : ""}` +
      `${graded ? `, ${graded.violations.length} violations, ${graded.advisories.length} advisories` : ""})`
  )
}

mkdirSync("lab/output", { recursive: true })
const out = `lab/output/composite-eval-${model.replace(/[:/]/g, "-")}.json`
writeFileSync(out, JSON.stringify({ model, runId, results }, null, 2))
console.log(`-> ${out}`)
