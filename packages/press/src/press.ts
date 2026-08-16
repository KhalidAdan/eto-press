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
 * Since the generation-2 package split (docs/PROPOSAL-GENERATION-2.md),
 * this package is the thin binding: @eto-press/platform holds the
 * machinery of a personal periodical (journal, front-door reading,
 * dialects, archive, mail, verbs), @eto-press/engine-eto holds the
 * editorial machinery (prefilter, judge, cluster, select, compositor,
 * the verification cage). run.ts here is the morning walk that binds
 * them — it moves behind the Engine joint in a later step. The public
 * API below is unchanged from generation 1.
 */
export { nightly } from "./run.js"
export { Ollama } from "@eto-press/platform/ollama"
export {
  loadMasthead,
  MastheadSchema,
  SourceSchema,
  type Masthead,
  type Source
} from "@eto-press/platform/masthead"
export * as config from "@eto-press/platform/config"
