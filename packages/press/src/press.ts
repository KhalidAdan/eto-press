/**
 * The press's public face — what @eto-press/press exports.
 *
 * The contract, generation 1: the press operates on the current working
 * directory AS the paper. It reads sources.toml (the editorial line) and
 * eto.toml (the nameplate and plumbing), keeps its journal in db/,
 * prints to archive/ and site/, and reaches outside that directory only
 * to fetch the news through the front door and — if configured — to send
 * the mail and write the backups. A paper is a directory; the press is
 * what visits it each morning.
 *
 * Everything else under src/ is the press's internals: the pipeline
 * stages (run.ts and what it orchestrates), the presentation dialects
 * (html.ts, email.ts, feed.ts, render.ts), and the standalone verbs the
 * package ships as executables (render-site, send-edition, correct,
 * export-journal, backup-journal, backup-readers, gen-functions-config).
 * When the engine moves to the monorepo (docs/ROADMAP.md, workstream 1),
 * this module becomes the package entry and the paper's repo keeps only
 * its content and configuration.
 */
export { nightly } from "./run.js"
export { Ollama } from "./ollama.js"
export {
  loadMasthead,
  MastheadSchema,
  SourceSchema,
  type Masthead,
  type Source
} from "./masthead.js"
export * as config from "./config.js"
