/**
 * eto models — the paper's models, managed instead of remembered.
 *
 *   eto models status   what is installed, what the lock expects
 *   eto models pull     download the paper's two models; pin if unpinned
 *   eto models pin      rewrite models.lock.json from what is installed
 *
 * The lock is §10 in one file: an `ollama pull` must never silently
 * change the paper's mind, so the press refuses to print on digest
 * drift. `pull` therefore never rewrites an existing lock — re-pinning
 * after a deliberate upgrade is its own verb, run on purpose.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { COMPOSITE_MODEL, MATCH_MODEL, OLLAMA_URL } from "./config.js"

const LOCK = "models.lock.json"
const MODELS = [MATCH_MODEL, COMPOSITE_MODEL]

const installedDigests = async (): Promise<Map<string, string>> => {
  const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`ollama /api/tags: HTTP ${res.status}`)
  const body = (await res.json()) as { models?: Array<{ name: string; digest: string }> }
  return new Map((body.models ?? []).map((m) => [m.name, m.digest]))
}

const readLock = (): Record<string, string> | null =>
  existsSync(LOCK) ? (JSON.parse(readFileSync(LOCK, "utf8")) as Record<string, string>) : null

const writeLock = (digests: Map<string, string>): void => {
  const entries = MODELS.filter((m) => digests.has(m)).map((m) => [m, digests.get(m)!])
  writeFileSync(LOCK, JSON.stringify(Object.fromEntries(entries), null, 2) + "\n")
}

const pullModel = async (model: string): Promise<void> => {
  const res = await fetch(`${OLLAMA_URL}/api/pull`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, stream: true })
  })
  if (!res.ok || res.body === null) throw new Error(`ollama /api/pull ${model}: HTTP ${res.status}`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let lastShown = -1
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      if (line.trim() === "") continue
      const p = JSON.parse(line) as {
        status?: string
        total?: number
        completed?: number
        error?: string
      }
      if (p.error !== undefined) throw new Error(`${model}: ${p.error}`)
      if (p.total !== undefined && p.completed !== undefined && p.total > 0) {
        const pct = Math.floor((p.completed / p.total) * 100)
        if (pct !== lastShown && pct % 5 === 0) {
          process.stdout.write(`\r  ${model}: ${pct}%   `)
          lastShown = pct
        }
      }
    }
  }
  process.stdout.write(`\r  ${model}: done      \n`)
}

const verb = process.argv[2] ?? "status"

if (verb === "status") {
  const installed = await installedDigests().catch(() => null)
  const lock = readLock()
  if (installed === null) {
    console.log(`ollama unreachable at ${OLLAMA_URL}`)
    process.exit(1)
  }
  for (const m of MODELS) {
    const have = installed.get(m)
    const want = lock?.[m]
    const state =
      have === undefined
        ? "MISSING — eto models pull"
        : want === undefined
          ? `installed ${have.slice(0, 12)} (unpinned)`
          : have === want
            ? `installed, matches lock (${have.slice(0, 12)})`
            : `DRIFTED — lock ${want.slice(0, 12)}, installed ${have.slice(0, 12)}; eto models pin to accept`
    console.log(`  ${m.padEnd(20)} ${state}`)
  }
  console.log(lock === null ? `  no ${LOCK} — first pull or print will pin` : `  lock: ${LOCK}`)
} else if (verb === "pull") {
  for (const m of MODELS) {
    await pullModel(m)
  }
  const digests = await installedDigests()
  const missing = MODELS.filter((m) => !digests.has(m))
  if (missing.length > 0) {
    console.error(`pulled but not visible in /api/tags: ${missing.join(", ")}`)
    process.exit(1)
  }
  if (readLock() === null) {
    writeLock(digests)
    console.log(`digests pinned to ${LOCK}`)
  } else {
    console.log(`existing ${LOCK} untouched — if this pull was a deliberate upgrade, run: eto models pin`)
  }
} else if (verb === "pin") {
  const digests = await installedDigests()
  const missing = MODELS.filter((m) => !digests.has(m))
  if (missing.length > 0) {
    console.error(`cannot pin — not installed: ${missing.join(", ")}`)
    process.exit(1)
  }
  writeLock(digests)
  console.log(`digests pinned to ${LOCK}: the press will hold these until you re-pin`)
} else {
  console.error(`unknown: eto models ${verb} — try status, pull, pin`)
  process.exit(1)
}
