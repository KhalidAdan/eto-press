#!/usr/bin/env node
// The eto CLI, generation 1: the paperboy's verbs, run in the current
// directory — which is to say, in a paper. Each verb loads the press's
// TypeScript directly via tsx's loader; the compile-and-dist story
// arrives with a later generation. init and doctor arrive with roadmap
// phase 2.
import { register } from "tsx/esm/api"

const VERBS = {
  print: ["@eto-press/press/main", "run the pipeline: gather, judge, composite, verify, archive"],
  render: ["@eto-press/press/render-site", "render the public site from the journal"],
  email: ["@eto-press/press/send-edition", "deliver the latest edition to the reader list (--test <addr>)"],
  correct: ["@eto-press/press/correct", "print a dated correction pointing back at an edition"],
  export: ["@eto-press/press/export-journal", "export the journal as diffable JSONL"],
  backup: ["@eto-press/press/backup-journal", "snapshot the journal (SQLite online backup)"],
  "backup-readers": ["@eto-press/press/backup-readers", "snapshot the reader list from SES"],
  "gen-functions": ["@eto-press/press/gen-functions-config", "regenerate functions/_config.ts from eto.toml"]
}

const verb = process.argv[2]
if (verb === undefined || VERBS[verb] === undefined) {
  console.log("eto — the press. Usage: eto <verb> [args]\n")
  for (const [v, [, help]] of Object.entries(VERBS)) {
    console.log(`  ${v.padEnd(15)} ${help}`)
  }
  console.log("\nNote: `render` expects the paper's stylesheet already compiled")
  console.log("(tailwindcss -i brief.css -o site/brief.css --minify).")
  process.exit(verb === undefined ? 0 : 1)
}

process.argv.splice(2, 1) // the verbs read argv themselves (e.g. email --test)
register()
await import(VERBS[verb][0])
