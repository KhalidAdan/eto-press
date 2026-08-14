/**
 * eto press — the whole morning, as one verb, in a paper.
 *
 * Order and fatality mirror the flagship's paperboy (run-eto.ps1), with
 * one improvement: if today's edition already exists, the print stage is
 * skipped but the tail still runs — render, export, email, backups are
 * all idempotent by construction (the email has its own sent-guard), so
 * an hourly retry after a partial morning finishes the morning instead
 * of exiting at a guard.
 *
 * What this verb deliberately does NOT do: git. Publishing the rendered
 * site is a paper-level deploy choice (the flagship commits and pushes;
 * another paper may rsync, or do nothing). The runner prints the paper;
 * the paper decides how it travels.
 *
 * Everything is logged to logs/press-YYYY-MM-DD.log as well as stdout.
 */
import { spawn } from "node:child_process"
import { createWriteStream, existsSync, mkdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { OLLAMA_URL } from "./config.js"

const args = new Set(process.argv.slice(2))
const noEmail = args.has("--no-email")

const today = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
})()

mkdirSync("logs", { recursive: true })
const logFile = createWriteStream(`logs/press-${today}.log`, { flags: "a" })
const log = (line: string): void => {
  const stamped = `[${new Date().toISOString().slice(11, 19)}] ${line}`
  console.log(stamped)
  logFile.write(stamped + "\n")
}

const script = (name: string): string => fileURLToPath(new URL(`./${name}.ts`, import.meta.url))

/** Run one press verb as a child (node --import tsx), teeing output. */
const step = (title: string, name: string, extra: Array<string> = []): Promise<number> =>
  new Promise((resolve) => {
    log(`-- ${title}`)
    const child = spawn(process.execPath, ["--import", "tsx", script(name), ...extra], {
      cwd: process.cwd(),
      env: process.env
    })
    child.stdout.on("data", (d: Buffer) => {
      process.stdout.write(d)
      logFile.write(d)
    })
    child.stderr.on("data", (d: Buffer) => {
      process.stderr.write(d)
      logFile.write(d)
    })
    child.on("close", (code) => resolve(code ?? 1))
  })

const fatal = (title: string, code: number): never => {
  log(`FATAL: ${title} exited ${code} — the press stops here (retry will resume)`)
  process.exit(code === 0 ? 1 : code)
}

// -- ollama up? (start it if the machine has it but forgot) ------------------
const ollamaUp = async (): Promise<boolean> => {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/version`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}
if (!(await ollamaUp())) {
  log("ollama not answering — attempting to start it")
  try {
    const served = spawn("ollama", ["serve"], { detached: true, stdio: "ignore" })
    served.unref()
  } catch {
    // fall through to the recheck below
  }
  const deadline = Date.now() + 30000
  let up = false
  while (Date.now() < deadline && !up) {
    await new Promise((r) => setTimeout(r, 1500))
    up = await ollamaUp()
  }
  if (!up) {
    log(`FATAL: ollama is not reachable at ${OLLAMA_URL} and could not be started`)
    process.exit(1)
  }
  log("ollama is up")
}

// -- the morning -------------------------------------------------------------
if (existsSync(`archive/${today}.md`)) {
  log(`the ${today} edition already exists — skipping print, finishing the tail`)
} else {
  const code = await step("print (the pipeline)", "main")
  if (code !== 0) fatal("print", code)
}

{
  const code = await step("render (the site)", "render-site")
  if (code !== 0) fatal("render", code)
}
{
  const code = await step("export (the journal)", "export-journal")
  if (code !== 0) log(`export exited ${code} (non-fatal)`)
}
if (!noEmail) {
  const code = await step("email (the edition)", "send-edition")
  if (code !== 0) log(`email exited ${code} (non-fatal — sent-guard makes retries safe)`)
}
{
  const code = await step("backup (the journal)", "backup-journal")
  if (code !== 0) log(`backup exited ${code} (non-fatal)`)
}
{
  const code = await step("backup (the readers)", "backup-readers")
  if (code !== 0) log(`backup-readers exited ${code} (non-fatal)`)
}

log("the morning is done. It ends.")
logFile.end()
