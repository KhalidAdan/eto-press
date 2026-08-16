/**
 * Minimal .env loader. Reads the repo-root .env (gitignored) into
 * process.env, mapping the editor's variable names to the SDK-standard
 * ones. Values never touch logs.
 */
import { existsSync, readFileSync } from "node:fs"

const ALIASES: Record<string, string> = {
  AWS_ACCESS_KEY: "AWS_ACCESS_KEY_ID",
  AWS_SECRET: "AWS_SECRET_ACCESS_KEY"
}

export const loadEnv = (path = ".env"): void => {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const key = ALIASES[m[1]!] ?? m[1]!
    if (process.env[key] === undefined) process.env[key] = m[2]!
  }
}
