/**
 * eto schedule — install the morning into the operating system.
 *
 * Prints exactly what it would do; touches nothing without --yes.
 * The job it installs is `npx eto press` in this paper's directory,
 * daily at --time (default 05:30), retried hourly for six hours — the
 * same shape as the flagship's hand-built Task Scheduler job.
 *
 *   eto schedule                  show the plan for this platform
 *   eto schedule --time 06:00     a different morning
 *   eto schedule --yes            actually install it
 */
import { spawnSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const argv = process.argv.slice(2)
const yes = argv.includes("--yes")
const timeIdx = argv.indexOf("--time")
const time = timeIdx > -1 ? (argv[timeIdx + 1] ?? "05:30") : "05:30"
if (!/^\d{2}:\d{2}$/.test(time)) {
  console.error(`--time must be HH:MM, got: ${time}`)
  process.exit(1)
}
const paperDir = process.cwd()
const [hh, mm] = time.split(":") as [string, string]

if (process.platform === "win32") {
  const tr = `cmd /c cd /d "${paperDir}" && npx eto press`
  const cmd = [
    "schtasks", "/Create", "/F",
    "/TN", "eto-press",
    "/SC", "DAILY",
    "/ST", time,
    "/RI", "60", "/DU", "06:00",
    "/TR", tr
  ]
  console.log("Windows Task Scheduler job:")
  console.log(`  name      eto-press`)
  console.log(`  daily at  ${time}, retried hourly for 6h`)
  console.log(`  runs      ${tr}`)
  if (!yes) {
    console.log(`\nnothing installed. Re-run with --yes to install, or run yourself:\n  ${cmd.join(" ")}`)
  } else {
    const r = spawnSync(cmd[0]!, cmd.slice(1), { stdio: "inherit" })
    process.exit(r.status ?? 1)
  }
} else if (process.platform === "darwin") {
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>press.eto</string>
  <key>WorkingDirectory</key><string>${paperDir}</string>
  <key>ProgramArguments</key><array>
    <string>/usr/bin/env</string><string>npx</string><string>eto</string><string>press</string>
  </array>
  <key>StartCalendarInterval</key><dict>
    <key>Hour</key><integer>${Number(hh)}</integer>
    <key>Minute</key><integer>${Number(mm)}</integer>
  </dict>
</dict></plist>
`
  const path = join(homedir(), "Library", "LaunchAgents", "press.eto.plist")
  console.log(`launchd agent at ${path}, daily at ${time}:`)
  console.log(plist)
  if (!yes) {
    console.log("nothing installed. Re-run with --yes to write the plist and load it.")
  } else {
    mkdirSync(join(homedir(), "Library", "LaunchAgents"), { recursive: true })
    writeFileSync(path, plist)
    const r = spawnSync("launchctl", ["load", path], { stdio: "inherit" })
    process.exit(r.status ?? 1)
  }
} else {
  const line = `${Number(mm)} ${Number(hh)} * * * cd "${paperDir}" && npx eto press >> logs/cron.log 2>&1`
  console.log("crontab line:")
  console.log(`  ${line}`)
  if (!yes) {
    console.log("\nnothing installed. Re-run with --yes to append it to your crontab.")
  } else {
    const current = spawnSync("crontab", ["-l"], { encoding: "utf8" })
    const existing = current.status === 0 ? current.stdout : ""
    if (existing.includes("npx eto press")) {
      console.log("an eto press line is already in your crontab — nothing added")
      process.exit(0)
    }
    const r = spawnSync("crontab", ["-"], { input: existing + line + "\n", stdio: ["pipe", "inherit", "inherit"] })
    process.exit(r.status ?? 1)
  }
}
