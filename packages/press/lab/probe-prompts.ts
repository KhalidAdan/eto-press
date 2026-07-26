/**
 * Known-answer probes for the same-event prompt, against live Ollama.
 * Run: npm run probe
 *
 * Origin: experiment 002 lost a 20-minute run to one over-strict sentence —
 * the model answered "no" to everything, including known positives. Every
 * prompt wording change gets run through this before it judges real data.
 * (Originally lab/probe_prompts.py; ported when the lab went TypeScript.)
 */

import { MATCH_MODEL, OLLAMA_URL } from "../src/config.js"
import { sameEventPrompt, type PromptItem } from "../src/prompts.js"

const MODEL = process.argv[2] ?? MATCH_MODEL
const OLLAMA = `${OLLAMA_URL}/api/chat`

type ProbeItem = PromptItem

const PAIRS: Record<string, readonly [ProbeItem, ProbeItem, "yes" | "no"]> = {
  "positive (Maine nomination)": [
    {
      outlet: "FOX News",
      title:
        "Maine Democrats crown Troy Jackson as Platner replacement as fresh scrutiny clouds Senate reset",
      summary:
        "Maine Democrats on Saturday quickly coronated Troy Jackson the party's Senate nominee after the implosion of ex-candidate Graham Platner in the showdown with Sen. Susan Collins."
    },
    {
      outlet: "NPR",
      title:
        "Democrats in Maine formally nominate Troy Jackson as their new candidate for U.S. Senate",
      summary:
        "Democrats in Maine have officially selected Troy Jackson as their new nominee for U.S. Senate. He will face longtime Republican incumbent Susan Collins."
    },
    "yes"
  ],
  "topical negative (two Trump stories)": [
    {
      outlet: "BBC",
      title: "Trump vows to investigate EU over fining of US tech companies",
      summary:
        "President Trump said he would investigate the European Union over fines levied against American technology firms."
    },
    {
      outlet: "NPR",
      title: "Trump makes jabs at rescheduled White House Correspondents' dinner",
      summary:
        "President Trump made jokes at the expense of the press during the rescheduled White House Correspondents' Dinner."
    },
    "no"
  ],
  "unrelated negative": [
    {
      outlet: "BBC",
      title: "More than 250,000 flee wildfires in France and Spain",
      summary:
        "Wildfires burning in southern France and Spain have forced mass evacuations."
    },
    {
      outlet: "FOX News",
      title: "Bargain buffet refuses to die while luxury dining takes over Vegas",
      summary:
        "A low-cost buffet remains popular in Las Vegas as upscale restaurants expand."
    },
    "no"
  ]
}

const ask = async (prompt: string): Promise<string> => {
  const res = await fetch(OLLAMA, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      options: { temperature: 0 }
    })
  })
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`)
  const data = (await res.json()) as { message: { content: string } }
  return data.message.content.trim().toLowerCase()
}

let failures = 0
console.log(`model: ${MODEL}\n`)
for (const [label, [a, b, expected]] of Object.entries(PAIRS)) {
  const answer = await ask(sameEventPrompt(a, b))
  const ok = answer === expected
  if (!ok) failures++
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}: got "${answer}", want "${expected}"`)
}

console.log(failures === 0 ? "\nall probes pass" : `\n${failures} probe(s) FAILED`)
process.exit(failures === 0 ? 0 : 1)
