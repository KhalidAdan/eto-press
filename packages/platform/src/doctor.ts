/**
 * eto doctor — preflight as a user-facing verb, run in a paper.
 *
 * Every silent assumption the morning run makes becomes a named, checked
 * line: the paper's files, the model server, the pinned digests, the GPU
 * neighborhood, the feeds, the journal, the mail. The failure modes here
 * were all learned the hard way (see docs/PIPELINE.md and the lockfile
 * story in run.ts); doctor exists so the next person learns them from a
 * checklist instead of a broken morning.
 *
 * Read-only by design: doctor never writes, never pulls, never repairs.
 * It reports, and it exits 1 if the press would stall.
 */
import { GetAccountCommand, SESv2Client } from "@aws-sdk/client-sesv2"
import Database from "better-sqlite3"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import * as TOML from "smol-toml"
import { COMPOSITE_MODEL, MAIL, MATCH_MODEL, OLLAMA_URL } from "./config.js"
import { loadEnv } from "./env.js"

type Status = "ok" | "warn" | "fail" | "skip"
interface Check {
  readonly name: string
  readonly status: Status
  readonly detail: string
}

const checks: Array<Check> = []
const report = (name: string, status: Status, detail: string): void => {
  checks.push({ name, status, detail })
  const badge = { ok: "  ok  ", warn: " WARN ", fail: " FAIL ", skip: "  --  " }[status]
  console.log(`${badge} ${name.padEnd(9)} ${detail}`)
}

const get = async (url: string, timeoutMs: number): Promise<Response> =>
  fetch(url, {
    headers: { "user-agent": "eto/0.1 (+local news compositor; front-door reader)" },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs)
  })

console.log("eto doctor — the press, examined\n")

// -- the paper ---------------------------------------------------------------
let feedUrls: Array<{ outlet: string; url: string }> = []
if (!existsSync("sources.toml")) {
  report("paper", "fail", "no sources.toml here — this directory is not a paper")
} else {
  try {
    const masthead = TOML.parse(readFileSync("sources.toml", "utf8")) as {
      source?: Array<{ name?: string; side?: string; feeds?: Array<string> }>
    }
    const sources = masthead.source ?? []
    feedUrls = sources.flatMap((s) =>
      (s.feeds ?? []).map((url) => ({ outlet: s.name ?? "?", url }))
    )
    const bad = sources.filter((s) => !s.name || !s.side || !s.feeds?.length)
    if (sources.length === 0) {
      report("paper", "fail", "sources.toml has no [[source]] blocks")
    } else if (bad.length > 0) {
      report("paper", "fail", `${bad.length} source(s) missing name/side/feeds`)
    } else {
      const toml = existsSync("eto.toml")
        ? "eto.toml present"
        : "no eto.toml — running on the press's neutral defaults"
      report("paper", existsSync("eto.toml") ? "ok" : "warn",
        `${sources.length} sources, ${feedUrls.length} feeds; ${toml}`)
    }
  } catch (e) {
    report("paper", "fail", `sources.toml unreadable: ${String(e).slice(0, 80)}`)
  }
}

// -- ollama ------------------------------------------------------------------
let ollamaUp = false
try {
  const res = await get(`${OLLAMA_URL}/api/version`, 5000)
  const body = (await res.json()) as { version?: string }
  ollamaUp = res.ok
  report("ollama", res.ok ? "ok" : "fail", `${body.version ?? "?"} at ${OLLAMA_URL}`)
} catch {
  report("ollama", "fail", `no answer at ${OLLAMA_URL} — is ollama running?`)
}

// -- models + the lock -------------------------------------------------------
if (ollamaUp) {
  try {
    const res = await get(`${OLLAMA_URL}/api/tags`, 10000)
    const body = (await res.json()) as {
      models?: Array<{ name: string; digest: string }>
    }
    const installed = new Map((body.models ?? []).map((m) => [m.name, m.digest]))
    const missing = [MATCH_MODEL, COMPOSITE_MODEL].filter((m) => !installed.has(m))
    if (missing.length > 0) {
      report("models", "fail",
        `missing: ${missing.join(", ")} — ollama pull, or eto models pull`)
    } else if (!existsSync("models.lock.json")) {
      report("models", "warn",
        `${MATCH_MODEL}, ${COMPOSITE_MODEL} installed; no models.lock.json (first run will pin)`)
    } else {
      const locked = JSON.parse(readFileSync("models.lock.json", "utf8")) as Record<string, string>
      const drifted = Object.entries(locked).filter(
        ([m, d]) => installed.has(m) && installed.get(m) !== d
      )
      report("models", drifted.length > 0 ? "fail" : "ok",
        drifted.length > 0
          ? `digest drift: ${drifted.map(([m]) => m).join(", ")} — the press will refuse to print (§10)`
          : `${MATCH_MODEL}, ${COMPOSITE_MODEL} installed; digests match the lock`)
    }
  } catch (e) {
    report("models", "fail", `could not list models: ${String(e).slice(0, 80)}`)
  }

  // -- the GPU neighborhood --------------------------------------------------
  // Learned 2026-08: resident sidecars (whisper, TTS) can starve the
  // compositor of VRAM; the symptom is "draft malformed" retries at
  // timeout-length intervals, which looks like a parser bug and is not.
  try {
    const res = await get(`${OLLAMA_URL}/api/ps`, 5000)
    const body = (await res.json()) as { models?: Array<{ name: string }> }
    const foreign = (body.models ?? [])
      .map((m) => m.name)
      .filter((n) => n !== MATCH_MODEL && n !== COMPOSITE_MODEL)
    report("gpu", foreign.length > 0 ? "warn" : "ok",
      foreign.length > 0
        ? `foreign model(s) resident: ${foreign.join(", ")} — the compositor can be starved (drafts time out)`
        : "no foreign models resident")
  } catch {
    report("gpu", "skip", "could not read /api/ps")
  }
}

// -- feeds -------------------------------------------------------------------
if (feedUrls.length > 0) {
  const results: Array<{ outlet: string; ok: boolean }> = []
  const queue = [...feedUrls]
  await Promise.all(
    Array.from({ length: Math.min(8, queue.length) }, async () => {
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        try {
          const res = await get(next.url, 15000)
          await res.body?.cancel()
          results.push({ outlet: next.outlet, ok: res.ok })
        } catch {
          results.push({ outlet: next.outlet, ok: false })
        }
      }
    })
  )
  const down = results.filter((r) => !r.ok)
  const namesOf = [...new Set(down.map((d) => d.outlet))].slice(0, 5).join(", ")
  const status: Status =
    down.length === 0 ? "ok" : down.length * 2 > results.length ? "fail" : "warn"
  report("feeds", status,
    `${results.length - down.length}/${results.length} reachable` +
      (down.length > 0 ? ` (down: ${namesOf}${down.length > 5 ? ", …" : ""})` : ""))
}

// -- the journal -------------------------------------------------------------
if (!existsSync("db/eto.sqlite")) {
  report("journal", "warn", "no journal yet — a fresh paper, or the wrong directory")
} else {
  try {
    const db = new Database("db/eto.sqlite", { readonly: true, fileMustExist: true })
    const run = db
      .prepare("SELECT run_id, finished_at, notes FROM runs WHERE finished_at IS NOT NULL ORDER BY run_id DESC LIMIT 1")
      .get() as { run_id: string; finished_at: string; notes: string | null } | undefined
    let mail = ""
    try {
      const sent = db
        .prepare("SELECT run_id, recipients FROM email_sends ORDER BY run_id DESC LIMIT 1")
        .get() as { run_id: string; recipients: number } | undefined
      if (sent) mail = `; last mail ${sent.run_id} to ${sent.recipients}`
    } catch {
      // no email_sends table: the paper has never mailed — not a defect
    }
    const editions = existsSync("archive")
      ? readdirSync("archive").filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).length
      : 0
    db.close()
    report("journal", run ? "ok" : "warn",
      run
        ? `${editions} edition(s); latest run ${run.run_id} (${run.notes ?? "no notes"})${mail}`
        : `journal exists but no finished run yet (${editions} edition(s) archived)`)
  } catch (e) {
    report("journal", "fail", `journal unreadable: ${String(e).slice(0, 80)}`)
  }
}

// -- mail --------------------------------------------------------------------
loadEnv()
if (process.env["AWS_ACCESS_KEY_ID"] === undefined) {
  report("mail", "skip", "no AWS credentials (.env) — the paper prints without them")
} else {
  try {
    const ses = new SESv2Client({ region: process.env["AWS_REGION"] ?? MAIL.region })
    const account = await ses.send(new GetAccountCommand({}))
    const quota = account.SendQuota ?? {}
    const left = (quota.Max24HourSend ?? 0) - (quota.SentLast24Hours ?? 0)
    report("mail", account.SendingEnabled === true ? "ok" : "fail",
      account.SendingEnabled === true
        ? `sending enabled; ${Math.round(left)} of ${Math.round(quota.Max24HourSend ?? 0)} daily sends remaining`
        : "SES reports sending DISABLED — check the reputation dashboard")
  } catch (e) {
    report("mail", "fail", `SES unreachable: ${String(e).slice(0, 80)}`)
  }
}

// -- the verdict -------------------------------------------------------------
const fails = checks.filter((c) => c.status === "fail").length
const warns = checks.filter((c) => c.status === "warn").length
console.log(
  fails > 0
    ? `\n${fails} check(s) failed — the press would stall.`
    : warns > 0
      ? `\nthe press is ready (${warns} warning(s) above worth a look).`
      : "\nthe press is ready."
)
process.exit(fails > 0 ? 1 : 0)
