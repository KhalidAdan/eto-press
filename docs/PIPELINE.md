# The Pipeline

This is the shared mental model of how eto runs, end to end, once per night.
When something breaks at runtime, the log line you are reading should map to a
stage in this document, the stage should map to a named error in the catalog,
and the error should tell you which table to query. If any of those links is
missing, that is a documentation defect and it gets fixed like a code defect.

Companion documents: `NORTH-STAR.md` (why), `experiments/` (evidence for the
design choices made here).

---

## Principles the architecture answers to

1. **The database is the journal.** Every expensive unit of work — a feed
   fetch, an article fetch, a model verdict, a composite draft — is keyed,
   cached in SQLite, and skipped on rerun. *Resume is not a feature; it is the
   absence of one.* A crash at minute 28 costs the unit of work that was in
   flight, nothing else. Recovery is always the same command: run it again.
2. **Failures are named values.** Every way a stage can fail is a tagged error
   type with structured fields (outlet, url, pairId, ...). No stage may fail
   anonymously. The error catalog at the bottom of this file is exhaustive by
   intent; an error observed at runtime that is not in the catalog is itself a
   bug.
3. **The model only touches prose.** Two stages call an LLM: judging pairs
   (stage 5) and compositing (stage 9). Every other stage is deterministic
   code. Verification of the model's output (stage 10) is deterministic on
   purpose — the creative component is always caged by checkable code.
4. **Prompts are versioned artifacts.** Every prompt lives in a file, is
   hashed, and the hash is part of the cache key of any work it produced.
   Change a prompt and its stale outputs invalidate themselves. Every prompt
   ships with known-answer probes (see `lab/probe_prompts.py` for the origin
   of this rule — experiment 002 lost a 20-minute run to one over-strict
   sentence).
5. **The archive is files; the database is the newsroom.** Published briefs
   are plain files in `archive/`, append-only, never rewritten (NORTH-STAR
   §9). The database can be deleted and rebuilt from the world; the archive
   cannot, so nothing in the pipeline is allowed to write into it except
   stage 11, and only at paths that do not yet exist.

---

## The run, stage by stage

Notation: each stage lists **In/Out**, **Tables**, **Fails with**, **Retry**,
and **Resume** semantics. All stages run inside a root span `eto.run` with one
child span per stage and one grandchild per unit of work; span attributes
carry the ids named here.

### 0. Preflight

Parse and validate `sources.toml` against a Schema. Run database migrations.
Ping Ollama (`/api/version`) and confirm required models are present
(`/api/tags`). Confirm the archive directory is writable and that today's
brief does not already exist.

- **Fails with:** `MastheadInvalid` (path, line, reason) · `OllamaDown` ·
  `ModelMissing` (model) · `BriefAlreadyPublished` (date)
- **Retry:** none. Preflight failures are configuration problems; retrying
  cannot fix them. Fail loud, fail immediately, before any work.
- **Resume:** n/a — stateless checks.
- **Note:** `run_id` is the editor's **local** calendar date — the morning
  the brief is for, not the UTC date. (Found the hard way: the first live
  run stamped itself with tomorrow's UTC date at 9:51 p.m. local.)
- **Model pinning (§10):** preflight compares each model's digest against
  `models.lock.json` (written on first run). Drift is `ModelDrifted`, fatal:
  an `ollama pull` must never silently change the paper's mind. Re-pinning
  is deliberate — delete the lockfile entry and rerun.
- **Corrections (§9):** the editor records one with
  `npm run correct -- <edition> <rank> "note"`. Pending corrections print at
  the top of the next edition (markdown, site, and email), dated, linking
  back; the pipeline marks them `printed_in` only after the archive write
  succeeds. The archive itself is never touched.
- **Resilience:** the paperboy exports the genuinely-ours tables (stories,
  clusters, feed_fetches, email_sends, corrections) as JSONL to
  `db/exports/` — committed as diffable text — and takes a rotating binary
  backup of the whole journal to `E:\eto-backups` (14 kept). The big tables
  stay out of git: rebuildable caches, and `articles` carries other
  outlets' full text, which we do not redistribute.

### 1. Fetch feeds

For every feed URL of every source: HTTP GET with eto's honest user-agent,
through the front door (NORTH-STAR §8). Store the raw body.

- **In/Out:** masthead → raw feed documents
- **Tables:** `feed_fetches` (url, run_id, status, http_code, bytes, ms) —
  every attempt recorded, success or not. This table *is* the §8 source-health
  history: an outlet that keeps refusing the front door surfaces here first.
- **Fails with:** `FeedUnreachable` (outlet, url, cause) — timeouts, DNS,
  4xx/5xx.
- **Retry:** exponential backoff + jitter, 3 attempts, **timeouts and 5xx
  only** — a 403/404 is a closed door, not a flaky one; it fails fast.
- **Resume:** feeds are cheap and fresh-by-nature; they are refetched on every
  run rather than cached. A run is identified by `run_id` = the brief date.
- **Degradation:** a failed feed never kills the run. The outlet's items are
  simply absent, the absence is logged, and stage 12 reports it to the editor.

### 2. Normalize items

Parse each feed (RSS and Atom vary wildly in the field; the parser is chosen
for battle scars, not elegance). For each entry: extract title, summary
(HTML-stripped), link, publication time; normalize encodings (experiment 002
surfaced mojibake in Guardian/Al Jazeera titles — treat encoding as hostile
input, always).

**Classify each item deterministically** as `news | opinion | video | podcast
| liveblog`, from URL patterns (`/opinion/`), title conventions ("Watch:",
"– podcast", a trailing "| Author Name"), and feed metadata. Experiment 002
failure mode 2: opinion and format items act as glue between unrelated
clusters. Only `news` items participate in event matching; the others are
retained and may attach to a story later as satellites, but they never create
or bridge clusters.

- **In/Out:** raw feeds → normalized, classified items
- **Tables:** `items` (id, run_id, outlet, side, kind, title, summary, link
  UNIQUE, published_at). Insert-or-ignore on link: refetching inserts nothing
  twice.
- **Fails with:** `FeedMalformed` (outlet, url, cause) — parser could not
  produce entries at all. Individual bad entries are skipped and counted, not
  fatal.
- **Retry:** none — deterministic; same input, same output.
- **Resume:** idempotent by the UNIQUE link constraint.

### 3. Window and prefilter

Keep items inside the 48-hour window. Generate all cross-outlet pairs among
`news` items; keep a pair only if the two items share ≥ 2 capitalized tokens,
or 1 that is rare across this run's corpus (frequency ≤ 4). Log the funnel
numbers (experiment 002: 20,413 → 539, a 97% cut by plain code before any
model ran).

- **In/Out:** items → candidate pairs
- **Tables:** none — recomputed each run in milliseconds; persisting derived
  data that is cheaper to recompute than to invalidate is how journals rot.
- **Fails with:** nothing (a bug here is a bug, not a runtime failure).
- **Tripwire:** if the funnel numbers are wildly off profile (e.g. 0 pairs, or
  10× the usual survivor count), abort with `FunnelAnomalous` before spending
  model time. Cheap sanity beats expensive garbage.

### 4. Judge pairs

For each candidate pair not already in `verdicts`: ask the matching model one
question — same news event, yes or no. One pair per prompt, one word out.
Model: small, non-thinking, local (currently `qwen3:4b-instruct`; experiment
002: thinking variants burn 50s/pair reasoning toward a one-word answer and
ignore their off-switches).

- **In/Out:** candidate pairs → boolean verdicts
- **Tables:** `verdicts` (item_a, item_b, model, prompt_hash, answer, raw,
  ms, PRIMARY KEY (item_a, item_b, model, prompt_hash)). **This key is the
  resume story of the whole pipeline**: rerunning after a crash skips every
  judged pair; changing the model or the prompt automatically re-judges.
- **Fails with:** `OllamaCallFailed` (pairId, cause) — HTTP/process errors.
  `VerdictUnparseable` (pairId, raw) — the answer wasn't yes/no; recorded as
  an abstention (treated as "no", but stored distinctly so a rash of them is
  visible).
- **Retry:** `OllamaCallFailed`: backoff + jitter, 3 attempts (the server may
  be reloading a model). `VerdictUnparseable`: one re-ask at temperature 0;
  then abstain.
- **Tripwire:** experiment 002's scar. If the first N judged pairs (N = 100)
  are unanimously "no" — or unanimously "yes" — abort with
  `VerdictsSuspicious`. A one-sided verdict stream means the prompt or model
  is broken, and 20 more minutes of it teaches nothing.

### 5. Cluster

Union-find over yes-edges, then a density gate: a cluster is accepted only if
its internal yes-density (yes-edges / judged-edges within the cluster) clears
a threshold; sprawling low-density blobs are split by dropping their weakest
bridges (experiment 002 failure mode 1: transitive chaining welded India's
resignation, pellet-gun videos, and a podcast into one 11-item "event").
Clusters that remain fat after the density gate go back to the judge model
with an explicit "split this into distinct events" question — the only other
question stage 5 is allowed to ask it.

- **In/Out:** verdicts → event clusters
- **Tables:** `clusters`, `cluster_items` (derived but persisted, because
  stages 6-11 reference cluster ids and the editor may correct them; an
  editor correction is ground truth and is never silently recomputed away —
  it is also, over months, the labeled dataset that could someday demote the
  judging model to something cheaper).
- **Fails with:** nothing new (model calls here reuse stage-4 error types).

### 5b. Cross-edition dedupe

The 48-hour window (stage 3) means consecutive editions share most of their
corpus; without this stage, yesterday's front page reprints itself (found the
hard way: the 2026-07-28 edition, printed 20 hours after a late 07-27 run).
A cluster is set aside as a **repeat** when more than half its member
articles already appeared in a story an earlier edition *published* —
selected-then-dropped stories never reached the reader, so their articles
stay eligible, and same-day rows are excluded so a retry can reprint its own
morning. A story that returns with mostly new reporting clears the threshold
and runs again as a development. Deterministic arithmetic, not a model's
mood; set-asides are logged and counted in the stage-11 funnel line.

- **In/Out:** event clusters → fresh clusters (repeats set aside)
- **Tables:** reads `stories` × `cluster_items` × `items`; writes nothing.
- **Fails with:** nothing new (a journal read; an empty journal means an
  empty printed set and every cluster is fresh).

### 6. Select stories

Apply the masthead's eligibility rules, all deterministic:

- ≥ 2 distinct outlets → otherwise it is "a rumour with good manners"
  (NORTH-STAR §1) and does not run.
- Measure side balance against the masthead's labels. A one-sided story
  *runs* — but carries the measurement ("no source on the left covered
  this"), stated plainly in the brief (§6). eto reports collapse; it does not
  censor it.
- Rank by breadth (outlets, sides), cap the day's brief at a fixed story
  count. It ends (§7); the cap is the design, not a limitation.

- **Tables:** `stories` (run_id, cluster_id, rank, balance_note)
- **Fails with:** `NothingToPrint` (run summary attached) — a valid, honest
  outcome: the brief for a quiet day says so and ends.

### 6b. The below-the-fold nomination

One model pick from OUTSIDE the selected front page (experiment 003's sole
survivor): the story whose consequence most exceeds its coverage. Strictly
additive — it can never reorder or displace the main stories. The
nomination reason is printed verbatim in the brief; the editor grades it by
reading and kills the feature with `below_the_fold = false` in the masthead
file. Candidate lists are always shuffled (003 run 1: position bias). Any
failure here degrades to "no nomination today," reported, never fatal.

- **Tables:** `stories` (fold_reason column)
- **Fails with:** stage-4 model-call error types; all degrade quietly.

### 7. Fetch articles

For each selected story, fetch the full article behind each member item's
link. Front door, honest UA, per-domain politeness delay. Extract body text
(readability-style extraction, then HTML-strip).

- **Tables:** `articles` (item_id, status, http_code, text, fetched_at) —
  keyed by item; a rerun refetches only what is missing or failed.
- **Fails with:** `ArticleUnfetchable` (outlet, url, http_code) ·
  `ArticleUnreadable` (url — fetched but extraction produced nothing usable).
- **Retry:** as stage 1 (backoff, timeouts/5xx only, closed doors fail fast).
- **Degradation:** an account that cannot be fetched **drops out of the
  composite** — the sources line names only accounts actually read (§3:
  nothing unattributed ships; a summary we half-read is not a source). If a
  story falls below 2 fetched accounts, it is dropped and the drop is
  reported. Incomplete beats wrong (§5). Text-only mirrors (text.npr.org et
  al.) are legitimate front doors and are configured per-outlet in the
  masthead file.

### 8. Composite

For each story: hand the compositor model the fetched accounts, get back the
four-part brief (headline · body · where-the-accounts-differ · sources).
Model: the larger local model (8B-class); this stage is low-volume — a
handful of stories — and can afford deliberation. Prompt encodes the
experiment-001 rules: no ungiven adjectives, no motive, no forecast,
attribute anonymous quotes to the outlet that carried them, ≤ 350 words,
it ends.

- **Tables:** `drafts` (cluster_hash, model, prompt_hash, attempt, text) —
  cache-keyed like verdicts; a crash mid-composite loses one draft.
- **Fails with:** stage-4 error types, plus `DraftMalformed` (story — the
  four-part shape did not parse).
- **Retry:** `DraftMalformed`: one re-ask; then the story is dropped and
  reported. We do not ship a brief whose shape we had to guess at.

### 9. Verify

Deterministic checks against the fetched source texts — the cage around the
compositor (experiment 001: the model's only failure class was *attribution
laundering*, a source's characterization drifting into eto's own voice; every
instance was mechanically detectable):

- Every direct quote in the draft appears verbatim in some fetched account.
- Every named entity in the draft appears in some fetched account.
- Evaluative adjectives in eto's own voice that appear in no account →
  violation.
- The sources line names exactly the accounts that were fetched and used.
- Word budget respected; the four parts present; nothing after the end.

Violations produce editor-style notes sent back to the compositor for **one**
revision pass (experiment 001 converged in one). Still failing → cut the
offending claims if the story survives their loss, else drop the story and
report why. A gap over a guess, every time (§5).

- **Tables:** `verifications` (draft_id, check, result, detail)
- **Fails with:** `BriefUnverifiable` (story, violations) — terminal for the
  story, never for the run.

### 10. Render and archive

Assemble surviving briefs into the day's edition: stories in rank order, each
with its sources line; corrections section up front when a prior brief needs
one — dated, pointing back, never editing the old file (§9). Write to
`archive/YYYY-MM-DD.md`. The write refuses to overwrite: if the path exists,
that is `BriefAlreadyPublished`, and it means a human is doing something odd
(or two runs raced) — either way, stop.

- **Tables:** `runs` gets its terminal row (finished_at, stories_published,
  stories_dropped).
- **Resume:** the archive write is the single non-idempotent step in the
  pipeline, which is why it is last, atomic (write temp file, rename), and
  guarded by existence.

### 11. Report to the editor

Append the run report to the brief (or emit alongside it): outlets fetched
and failed, funnel numbers, stories dropped and the named error that dropped
each, balance measurements, verdicts/sec, anything the tripwires noticed.
This is the §6 measurement surface — "your sources have collapsed onto one
side of a story" appears here as data, not as advice. When eto misbehaves,
this report plus the span tree is where the 6 a.m. debugging session starts —
by design, it should never start in a stack trace.

---

## Cross-cutting machinery

**Effect mapping.** Each stage is an `Effect` with its failure types in its
signature; the run is an `Effect.gen` script that reads exactly like the list
above. Retry policies are `Schedule` values owned by the stage. External
services (HTTP, SQLite, Ollama, clock) are Layers — the test suite swaps in
fakes, which is how prompt probes and failure-path tests run without a GPU or
a network. Every stage and unit of work is a span; spans carry the ids that
the tables use, so a trace, a log line, and a row can always be joined.

**Tripwires are first-class.** `FunnelAnomalous`, `VerdictsSuspicious` — the
pipeline carries statistical self-checks that abort early when a stage's
output distribution says "misconfiguration" even though every individual call
succeeded. Experiment 002 paid for this lesson; the 0-matches run failed
*silently, politely, and completely*.

**One database, one file.** SQLite at `db/eto.sqlite` (WAL mode). Backup is
copying a file; inspection is `sqlite3` and SELECT; nothing lives at a path
the user can't open. The full DB can be rebuilt from the world except:
editor corrections and the source-health history — the two tables that are
genuinely ours.

## Error catalog

| Error | Stage | Fields | Retried? | Kills the run? |
|---|---|---|---|---|
| `MastheadInvalid` | 0 | path, line, reason | no | yes |
| `OllamaDown` | 0 | — | no | yes |
| `ModelMissing` | 0 | model | no | yes |
| `ModelDrifted` | 0 | model, expected, actual | no | yes |
| `BriefAlreadyPublished` | 0, 10 | date | no | yes |
| `FeedUnreachable` | 1 | outlet, url, cause | 3×, transient only | no |
| `FeedMalformed` | 2 | outlet, url, cause | no | no |
| `FunnelAnomalous` | 3 | expected, observed | no | yes |
| `OllamaCallFailed` | 4, 5, 8 | unit id, cause | 3×, backoff | no (unit fails) |
| `VerdictUnparseable` | 4 | pairId, raw | 1 re-ask | no (abstains) |
| `VerdictsSuspicious` | 4 | window, distribution | no | yes |
| `ArticleUnfetchable` | 7 | outlet, url, code | 3×, transient only | no (account drops) |
| `ArticleUnreadable` | 7 | url | no | no (account drops) |
| `DraftMalformed` | 8 | story | 1 re-ask | no (story drops) |
| `BriefUnverifiable` | 9 | story, violations | 1 revision | no (story drops) |
| `NothingToPrint` | 6 | run summary | no | no — an honest edition |

The row-level rule underneath the table: **configuration and distribution
problems kill the run loudly; unit-of-work problems degrade the brief
quietly and honestly.** A missing outlet is a smaller brief. A broken prompt
is a stopped press.
