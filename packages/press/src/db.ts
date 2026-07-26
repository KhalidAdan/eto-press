/**
 * The database is the journal (docs/PIPELINE.md, principle 1). One SQLite
 * file; every expensive unit of work keyed and cached; resume is rerun.
 */
import { SqlClient } from "@effect/sql"
import { Effect } from "effect"

const TABLES = [
  `CREATE TABLE IF NOT EXISTS runs (
    run_id      TEXT PRIMARY KEY,       -- the brief date, YYYY-MM-DD
    started_at  TEXT NOT NULL,
    finished_at TEXT,
    notes       TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS feed_fetches (
    run_id   TEXT NOT NULL,
    outlet   TEXT NOT NULL,
    url      TEXT NOT NULL,
    status   TEXT NOT NULL,             -- ok | unreachable | malformed
    http_code INTEGER,
    ms       INTEGER,
    items_kept INTEGER,
    detail   TEXT,
    fetched_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id       TEXT NOT NULL,         -- run that first saw it
    outlet       TEXT NOT NULL,
    side         TEXT NOT NULL,
    kind         TEXT NOT NULL,         -- news | opinion | video | podcast | liveblog
    title        TEXT NOT NULL,
    summary      TEXT NOT NULL,
    link         TEXT NOT NULL UNIQUE,  -- the idempotence key
    published_at TEXT NOT NULL
  )`,
  // Persisted (not just derived) because stages 6-11 reference clusters and
  // future editor corrections are ground truth that must never be silently
  // recomputed away. Until corrections exist, reruns replace by run_id.
  `CREATE TABLE IF NOT EXISTS clusters (
    run_id       TEXT NOT NULL,
    cluster_hash TEXT NOT NULL,          -- stable digest of member links
    density      REAL NOT NULL,          -- yes-edges / judged-edges inside
    was_split    INTEGER NOT NULL,       -- 1 if the density gate cut bridges
    item_count   INTEGER NOT NULL,
    outlet_count INTEGER NOT NULL,
    sides        TEXT NOT NULL,          -- e.g. "left/center/right"
    created_at   TEXT NOT NULL,
    PRIMARY KEY (run_id, cluster_hash)
  )`,
  `CREATE TABLE IF NOT EXISTS cluster_items (
    run_id       TEXT NOT NULL,
    cluster_hash TEXT NOT NULL,
    item_id      INTEGER NOT NULL,
    PRIMARY KEY (run_id, cluster_hash, item_id)
  )`,
  `CREATE TABLE IF NOT EXISTS articles (
    item_id    INTEGER PRIMARY KEY,      -- cache key: rerun refetches only failures
    status     TEXT NOT NULL,            -- ok | unfetchable | unreadable
    http_code  INTEGER,
    text       TEXT,
    fetched_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS stories (
    run_id       TEXT NOT NULL,
    cluster_hash TEXT NOT NULL,
    rank         INTEGER NOT NULL,
    balance_note TEXT,                   -- the §6 measurement, printed as-is
    status       TEXT NOT NULL,          -- selected | published | dropped
    reason       TEXT,                   -- why dropped, for the run report
    PRIMARY KEY (run_id, cluster_hash)
  )`,
  `CREATE TABLE IF NOT EXISTS drafts (
    cluster_hash TEXT NOT NULL,
    model        TEXT NOT NULL,
    prompt_hash  TEXT NOT NULL,
    attempt      INTEGER NOT NULL,       -- 0 first pass, 1 after revision notes
    headline     TEXT NOT NULL,
    body         TEXT NOT NULL,
    differ       TEXT NOT NULL,
    sources_line TEXT NOT NULL,
    raw          TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    PRIMARY KEY (cluster_hash, model, prompt_hash, attempt)
  )`,
  `CREATE TABLE IF NOT EXISTS verifications (
    cluster_hash TEXT NOT NULL,
    attempt      INTEGER NOT NULL,
    "check"      TEXT NOT NULL,
    result       TEXT NOT NULL,          -- pass | violation | advisory
    detail       TEXT,
    verified_at  TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS email_sends (
    run_id     TEXT PRIMARY KEY,        -- one delivery per edition, ever
    sent_at    TEXT NOT NULL,
    recipients INTEGER NOT NULL,
    failures   INTEGER NOT NULL
  )`,
  // Stage 4+ tables are declared now so the journal's shape is complete:
  `CREATE TABLE IF NOT EXISTS verdicts (
    item_a      INTEGER NOT NULL,
    item_b      INTEGER NOT NULL,
    model       TEXT NOT NULL,
    prompt_hash TEXT NOT NULL,
    answer      TEXT NOT NULL,          -- yes | no | abstain
    raw         TEXT,
    ms          INTEGER,
    judged_at   TEXT NOT NULL,
    PRIMARY KEY (item_a, item_b, model, prompt_hash)
  )`
] as const

/** Additive migrations for tables that already exist in journals in the
 * wild. Errors from already-applied ALTERs are expected and ignored. */
const MIGRATIONS = [
  `ALTER TABLE stories ADD COLUMN fold_reason TEXT`,
  // The outlet's own designated link-preview image (og:image), captured at
  // article fetch time. Hotlinked with credit, never rehosted.
  `ALTER TABLE articles ADD COLUMN og_image TEXT`
] as const

export const ensureSchema = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql.unsafe("PRAGMA journal_mode = WAL")
  for (const ddl of TABLES) {
    yield* sql.unsafe(ddl)
  }
  for (const migration of MIGRATIONS) {
    yield* sql.unsafe(migration).pipe(Effect.ignore)
  }
}).pipe(Effect.withSpan("stage0.ensureSchema"))
