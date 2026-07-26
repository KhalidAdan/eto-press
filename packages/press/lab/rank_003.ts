/**
 * Experiment 003 — can a local model exercise front-page news judgment?
 *
 * Takes the latest run's real clusters, asks the compositor model to pick
 * and order the front page under different declared desk notes (the
 * masthead-owned, stated-not-inferred kind), with a printed one-line
 * reason per pick. Baseline: the current breadth ranking (aggregated
 * human editorial judgment across the masthead's outlets).
 *
 * Run: npx tsx lab/rank_003.ts
 */
import Database from "better-sqlite3"
import { mkdirSync, writeFileSync } from "node:fs"

const MODEL = "llama3.1:8b"
const db = new Database("db/eto.sqlite")

const runId = (db
  .prepare("SELECT max(run_id) AS r FROM clusters")
  .get() as { r: string }).r

const clusters = db
  .prepare(
    "SELECT cluster_hash, sides, item_count, outlet_count FROM clusters WHERE run_id = ? ORDER BY outlet_count DESC, item_count DESC"
  )
  .all(runId) as Array<{
  cluster_hash: string
  sides: string
  item_count: number
  outlet_count: number
}>

const titlesFor = db.prepare(
  `SELECT i.title, i.outlet FROM cluster_items ci JOIN items i ON i.id = ci.item_id
   WHERE ci.run_id = ? AND ci.cluster_hash = ? LIMIT 3`
)

const catalog = clusters.map((c, idx) => {
  const titles = titlesFor.all(runId, c.cluster_hash) as Array<{
    title: string
    outlet: string
  }>
  return {
    id: `c${idx + 1}`,
    hash: c.cluster_hash,
    line:
      `c${idx + 1} [${c.sides}] (${c.outlet_count} outlets, ${c.item_count} items): ` +
      titles.map((t) => `${t.title} (${t.outlet})`).join(" | ")
  }
})

const DESKS: Record<string, string> = {
  "control (pure news judgment)":
    "No desk note. Rank purely on news judgment: consequence, scale, novelty, and how directly events affect people.",
  "statecraft desk":
    "More: statecraft, courts, elections, economy, energy, technology, wars and their endings. Less: celebrity, sports, palace intrigue, process stories.",
  "human impact desk":
    "More: stories that change ordinary lives — health, prices, disasters, rights, safety. Less: horse-race politics, punditry, media covering media, sports."
}

const ask = async (prompt: string): Promise<string> => {
  const res = await fetch("http://localhost:11434/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      options: { temperature: 0, num_ctx: 8192 }
    })
  })
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`)
  return ((await res.json()) as { message: { content: string } }).message.content
}

const results: Record<string, Array<{ rank: number; id: string; reason: string }>> = {}

/** Deterministic per-desk shuffle: if picks track list position rather than
 * content, different orders per desk will expose it immediately. */
const shuffled = (seed: number) => {
  const arr = [...catalog]
  let s = seed
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 48271) % 2147483647
    const j = s % (i + 1)
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  return arr
}

let deskIndex = 0
for (const [deskName, deskNote] of Object.entries(DESKS)) {
  deskIndex++
  const deck = shuffled(deskIndex * 7919)
  const prompt =
    "You are the front-page editor of a daily news brief. Below are today's " +
    "candidate stories in RANDOM ORDER — list position means nothing. Each " +
    "is one real-world event covered by multiple outlets; [brackets] show " +
    "which political sides covered it, then how many outlets and articles, " +
    "then example headlines.\n\n" +
    deck.map((c) => c.line).join("\n") +
    `\n\nDesk note from the editor: ${deskNote}\n\n` +
    "Choose the 8 stories that lead today's paper, in order of importance; " +
    "first is the lead story. Weigh the desk note heavily. Output exactly 8 " +
    "lines and nothing else. Every line MUST start with the rank number, " +
    "then a period, then the story id, then a dash, then a one-line reason. " +
    "Example of the required format:\n1. c37 — reason it leads\n2. c4 — reason\n"
  const raw = await ask(prompt)
  const picks: Array<{ rank: number; id: string; reason: string }> = []
  for (const m of raw.matchAll(/^\s*(?:(\d+)[.)]\s*)?(c\d+)\s*[—–:-]+\s*(.+)$/gm)) {
    picks.push({
      rank: m[1] ? Number(m[1]) : picks.length + 1,
      id: m[2]!,
      reason: m[3]!.trim()
    })
  }
  results[deskName] = picks
  console.log(`\n=== ${deskName}`)
  if (picks.length === 0) console.log(raw.slice(0, 400))
  for (const p of picks) {
    const line = catalog.find((c) => c.id === p.id)?.line ?? "??"
    console.log(`  ${p.rank}. ${line.split(":")[1]?.split("|")[0]?.trim().slice(0, 70)}`)
    console.log(`     → ${p.reason.slice(0, 100)}`)
  }
}

console.log("\n=== baseline: breadth ranking (what stage 6 actually published)")
const published = db
  .prepare(
    `SELECT s.rank, d.headline FROM stories s
     LEFT JOIN drafts d ON d.cluster_hash = s.cluster_hash
     WHERE s.run_id = ? AND s.status = 'published'
     GROUP BY s.cluster_hash ORDER BY s.rank`
  )
  .all(runId) as Array<{ rank: number; headline: string | null }>
for (const p of published) console.log(`  ${p.rank}. ${p.headline?.slice(0, 80)}`)

mkdirSync("lab/output", { recursive: true })
writeFileSync(
  `lab/output/rank-003-${runId}.json`,
  JSON.stringify({ runId, model: MODEL, catalog, results, published }, null, 2)
)
console.log(`\nsaved lab/output/rank-003-${runId}.json`)
