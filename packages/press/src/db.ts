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
  `CREATE TABLE IF NOT EXISTS stories (
    run_id       TEXT NOT NULL,
    cluster_hash TEXT NOT NULL,
    rank         INTEGER NOT NULL,
    balance_note TEXT,                   -- the §6 measurement, printed as-is
    status       TEXT NOT NULL,          -- selected | published | dropped
    reason       TEXT,                   -- why dropped, for the run report
    PRIMARY KEY (run_id, cluster_hash)
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

export const ensureSchema = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql.unsafe("PRAGMA journal_mode = WAL")
  for (const ddl of TABLES) {
    yield* sql.unsafe(ddl)
  }
}).pipe(Effect.withSpan("stage0.ensureSchema"))
