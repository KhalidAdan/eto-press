/**
 * Audition a judge candidate against the real journal.
 * Run: npx tsx lab/judge-eval.ts <model> [sampleSize]
 *
 * Draws a deterministic, stratified sample of already-judged pairs from
 * db/eto.sqlite (half incumbent-yes, half incumbent-no, stable order — every
 * candidate sees the identical set), re-judges them with the candidate at
 * temperature 0 using the PRODUCTION prompt and parser, and writes
 * lab/output/judge-eval-<model>.json for cross-model comparison.
 *
 * Agreement with the incumbent is NOT accuracy — the incumbent may be wrong.
 * The point is to surface disagreements small enough to adjudicate by hand.
 */
import Database from "better-sqlite3"
import { mkdirSync, writeFileSync } from "node:fs"
import { MATCH_MODEL, OLLAMA_URL } from "../src/config.js"
import { parseVerdict } from "../src/judge.js"
import { SAME_EVENT_PROMPT_HASH, sameEventPrompt } from "../src/prompts.js"

const model = process.argv[2]
if (!model) {
  console.error("usage: tsx lab/judge-eval.ts <model> [sampleSize]")
  process.exit(1)
}
const SAMPLE = Number(process.argv[3] ?? 300)

interface Row {
  item_a: number
  item_b: number
  answer: string
  outlet_a: string
  title_a: string
  summary_a: string
  outlet_b: string
  title_b: string
  summary_b: string
}

const db = new Database("db/eto.sqlite", { readonly: true })
const rows = db
  .prepare(
    `SELECT v.item_a, v.item_b, v.answer,
            ia.outlet outlet_a, ia.title title_a, ia.summary summary_a,
            ib.outlet outlet_b, ib.title title_b, ib.summary summary_b
     FROM verdicts v
     JOIN items ia ON ia.id = v.item_a
     JOIN items ib ON ib.id = v.item_b
     WHERE v.model = ? AND v.prompt_hash = ? AND v.answer IN ('yes', 'no')
     ORDER BY v.item_a, v.item_b`
  )
  .all(MATCH_MODEL, SAME_EVENT_PROMPT_HASH) as Array<Row>

// Deterministic stratified sample: spread each class evenly across the
// journal instead of taking one dense stretch of ids.
const take = (cls: "yes" | "no", n: number): Array<Row> => {
  const pool = rows.filter((r) => r.answer === cls)
  const step = Math.max(1, Math.floor(pool.length / n))
  return pool.filter((_, i) => i % step === 0).slice(0, n)
}
const sample = [...take("yes", SAMPLE / 2), ...take("no", SAMPLE / 2)]
console.log(
  `${model}: ${sample.length} pairs (${sample.filter((r) => r.answer === "yes").length} incumbent-yes) ` +
    `from ${rows.length} journaled ${MATCH_MODEL} verdicts`
)

// Thinking models burn latency the judge can't afford; ask Ollama to turn it
// off (think: false). Models without a thinking mode reject the parameter —
// detect on the first call and remember.
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
        options: { temperature: 0 }
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
  const thinking = data.message.thinking ? `<think>${data.message.thinking}</think>` : ""
  return { raw: thinking + data.message.content, ms: Date.now() - t0 }
}

interface Result {
  item_a: number
  item_b: number
  incumbent: string
  got: string
  ms: number
  titles: [string, string]
}

const results: Array<Result> = []
let agree = 0
const started = Date.now()
for (const [i, r] of sample.entries()) {
  const prompt = sameEventPrompt(
    { outlet: r.outlet_a, title: r.title_a, summary: r.summary_a },
    { outlet: r.outlet_b, title: r.title_b, summary: r.summary_b }
  )
  const { raw, ms } = await ask(prompt)
  const got = parseVerdict(raw) ?? "abstain"
  if (got === r.answer) agree++
  results.push({
    item_a: r.item_a,
    item_b: r.item_b,
    incumbent: r.answer,
    got,
    ms,
    titles: [`${r.outlet_a}: ${r.title_a}`, `${r.outlet_b}: ${r.title_b}`]
  })
  if ((i + 1) % 25 === 0) {
    const rate = (i + 1) / ((Date.now() - started) / 1000)
    console.log(`  ${i + 1}/${sample.length} (${rate.toFixed(1)}/s, agree ${agree})`)
  }
}

const abstains = results.filter((r) => r.got === "abstain").length
const yesRate = results.filter((r) => r.got === "yes").length / results.length
const msSorted = results.map((r) => r.ms).sort((a, b) => a - b)
const summary = {
  model,
  sample: results.length,
  agreementWithIncumbent: agree / results.length,
  abstains,
  yesRate,
  medianMs: msSorted[Math.floor(msSorted.length / 2)],
  totalMinutes: (Date.now() - started) / 60000,
  disagreements: results.filter((r) => r.got !== r.incumbent)
}

mkdirSync("lab/output", { recursive: true })
const out = `lab/output/judge-eval-${model.replace(/[:/]/g, "-")}.json`
writeFileSync(out, JSON.stringify({ summary, results }, null, 2))
console.log(
  `\n${model}: agreement ${(summary.agreementWithIncumbent * 100).toFixed(1)}%, ` +
    `yes-rate ${(yesRate * 100).toFixed(1)}%, abstains ${abstains}, ` +
    `median ${summary.medianMs}ms -> ${out}`
)
