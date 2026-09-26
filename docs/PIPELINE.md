# The Pipeline

This is the shared mental model of how eto runs, end to end, once per night.
When something breaks at runtime, the log line you are reading should map to a
stage in this document, the stage should map to a named error in the catalog,
and the error should tell you which table to query. If any of those links is
missing, that is a documentation defect and it gets fixed like a code defect.

Companion documents: `NORTH-STAR.md` (why), `experiments/` (evidence for the
design choices made here).

**Generation 2 overlay (as built, 2026-08-16).** The stages below are
unchanged, but they no longer live in one program. Stage 0 and stages 10-11
are the **platform frame** (`packages/press/src/run.ts`); stages 1-9 are the
**eto engine's** morning, behind one call — `engine.edition(day)`
(`packages/engine-eto/src/engine.ts`). The engine returns either an Edition
(stories, its own report, advisories) or `NoEdition` — true silence: no
archive file, no mail, one honest note in the runs table. A different
engine substitutes a different middle entirely; the frame and its
guarantees stay. See "The joint" below the stage list.

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
3. **The model only touches prose.** Three stages ask the inference
   boundary a typed question: judging pairs (stage 4), the below-the-fold
   nomination (stage 6b), and compositing (stage 8, plus stage 9's one
   revision pass). Every other stage is deterministic code. Verification of
   the model's output (stage 9) is deterministic on purpose — the creative
   component is always caged by checkable code.
4. **Prompts are versioned artifacts.** Every prompt lives in a file, is
   hashed, and the hash is part of the cache key of any work it produced.
   Change a prompt and its stale outputs invalidate themselves. Every prompt
   ships with known-answer probes (see `packages/press/lab/probe-prompts.ts`
   for the origin of this rule — experiment 002 lost a 20-minute run to one
   over-strict sentence).
5. **The archive is files; the database is the newsroom.** Published briefs
   are plain files in `archive/`, append-only, never rewritten (NORTH-STAR
   §9). The database can be deleted and rebuilt from the world; the archive
   cannot, so nothing in the pipeline is allowed to write into it except
   stage 10, and only at paths that do not yet exist.

---

## The run, stage by stage

Notation: each stage lists **In/Out**, **Tables**, **Fails with**, **Retry**,
and **Resume** semantics. All stages run inside a root span `eto.run` with one
child span per stage and one grandchild per unit of work; span attributes
carry the ids named here.

### 0. Preflight

Parse and validate `sources.toml` against a Schema. Run database migrations.
If the engine declares any models, ask the inference provider to pin them
(`inference.pin()` — for Ollama, one `/api/tags` call): every configured
model must be present, and each answers with the strongest identity the
provider can promise (Ollama: a content digest). Nothing else is checked
here; the archive is guarded at the write itself (stage 10).

Since generation 2, the model list comes from the **engine's declaration**
(`engine.models`) — an engine that declares none (the desk engine) skips
Ollama entirely — and an empty `[[source]]` list is the *engine's* call:
the platform accepts it, the eto engine refuses it by name, the desk engine
never looks.

- **Fails with:** `MastheadInvalid` (path, reason) · `OllamaDown` (url,
  cause) · `ModelMissing` (model, installed) · `ModelDrifted` (model,
  expected, actual)
- **Retry:** none. Preflight failures are configuration problems; retrying
  cannot fix them. Fail loud, fail immediately, before any work.
- **Resume:** n/a — stateless checks.
- **Note:** `run_id` is the editor's **local** calendar date — the morning
  the brief is for, not the UTC date. (Found the hard way: the first live
  run stamped itself with tomorrow's UTC date at 9:51 p.m. local.)
- **Model pinning (§10):** preflight compares each pinned digest against
  `models.lock.json` (written on the first print if absent; `eto models
  pull` does the same, and only then). Drift is `ModelDrifted`, fatal: an
  `ollama pull` must never silently change the paper's mind. Re-pinning is
  deliberate — `eto models pin`. A model whose provider exposes no digest
  is logged "unpinnable" and never written to the lock.
- **Corrections (§9):** the editor records one with
  `eto correct <edition> <rank> "note"`. Pending corrections print at
  the top of the next edition (markdown, site, and email), dated, linking
  back; the pipeline marks them `printed_in` only after the archive write
  succeeds. The archive itself is never touched.
- **Resilience:** `eto export` writes the genuinely-ours tables (stories,
  clusters, feed_fetches, email_sends, corrections) as JSONL to
  `db/exports/` — diffable text, committed by papers that deploy from git —
  and `eto backup` takes a rotating binary backup of the whole journal to
  `[backup] dir` (default `backups`, inside the paper and gitignored; point
  it at another disk when configuring for real), keeping `[backup] keep`
  (default 14). The big tables stay out of git: rebuildable caches, and
  `articles` carries other outlets' full text, which we do not redistribute.

### 1. Fetch feeds

For every feed URL of every source: HTTP GET with eto's honest user-agent,
through the front door (NORTH-STAR §8). Store the raw body.

- **In/Out:** masthead → raw feed documents
- **Tables:** `feed_fetches` (run_id, outlet, url, status, http_code, ms,
  items_kept, detail, fetched_at) — every attempt recorded, success or not.
  This table *is* the §8 source-health history: an outlet that keeps
  refusing the front door surfaces here first.
- **Fails with:** `FeedUnreachable` (outlet, url, cause, transient) —
  timeouts, DNS, 4xx/5xx.
- **Retry:** exponential backoff + jitter, 3 attempts, **timeouts and 5xx
  only** — a 403/404 is a closed door, not a flaky one; it fails fast.
- **Resume:** feeds are cheap and fresh-by-nature; they are refetched on every
  run rather than cached. A run is identified by `run_id` = the brief date.
- **Degradation:** a failed feed never kills the run. The outlet's items are
  simply absent, the absence is logged, and stage 11 reports it to the editor.

### 2. Normalize items

Parse each feed (RSS and Atom vary wildly in the field; the parser is chosen
for battle scars, not elegance). For each entry: extract title, summary
(HTML-stripped), link, publication time; normalize encodings (experiment 002
surfaced mojibake in Guardian/Al Jazeera titles — treat encoding as hostile
input, always).

**Classify each item deterministically** as `news | opinion | video | podcast
| liveblog | digest`, from URL patterns (`/opinion/`), title conventions
("Watch:", "– podcast", a trailing "| Author Name"), and feed metadata.
Since generation 2 the classifier is the **engine's** (deciding what counts
as news is doctrine), injected into the platform's feed ingest —
`packages/engine-eto/src/classify.ts`. Experiment 002
failure mode 2: opinion and format items act as glue between unrelated
clusters. Only `news` items participate in event matching; the others are
retained and may attach to a story later as satellites, but they never create
or bridge clusters.

- **In/Out:** raw feeds → normalized, classified items
- **Tables:** `items` (id, run_id, outlet, side, kind, title, summary, link
  UNIQUE, published_at). Upsert on link: refetching inserts nothing twice;
  an existing row only has its `side` and `kind` refreshed from the current
  masthead and classifier.
- **Fails with:** `FeedMalformed` (outlet, url, cause) — parser could not
  produce entries at all. Individual bad entries are skipped and counted, not
  fatal.
- **Retry:** none — deterministic; same input, same output.
- **Resume:** idempotent by the UNIQUE link constraint.

### 2b. Accounts carried by the feed itself

Some publishers ship the whole article in the feed (`content:encoded`;
Axios sends ~2k characters, the entire smart-brevity card). An entry whose
stripped content runs to at least 1,200 characters (`FEED_FULLTEXT_MIN`)
is journaled into `articles` as that item's account of record — publisher
text in the feed *is* the front door (§8), and it un-ghosts outlets whose
article pages are unreadable to ordinary tools. Teaser-length descriptions
stay ignored. Stage 7 skips whatever is already journaled as read.

- **In/Out:** feed entries with full text → journaled accounts
- **Tables:** `articles` (status `ok`, `http_code` NULL) — never overwrites
  an account a page fetch already read successfully.
- **Fails with:** nothing new.

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
- **Tripwire:** if the funnel numbers are off profile — more than 20 news
  items yielding 0 candidate pairs, or candidates exceeding 20× the news
  item count — abort with `FunnelAnomalous` (items, candidatePairs, reason)
  before spending model time. Cheap sanity beats expensive garbage.

### 4. Judge pairs

For each candidate pair not already in `verdicts`: ask the inference
boundary its same-event question — same news event, yes or no. One pair
per ask, one typed answer back. Model: small, non-thinking, local
(currently `qwen3:4b-instruct`; experiment 002: thinking variants burn
50s/pair reasoning toward a one-word answer and ignore their off-switches).

- **In/Out:** candidate pairs → verdicts (yes | no | abstain)
- **Tables:** `verdicts` (item_a, item_b, model, prompt_hash, answer,
  confidence, raw, ms, judged_at, PRIMARY KEY (item_a, item_b, model,
  prompt_hash)). `model` is the provider's model identity and `prompt_hash`
  the hash of its question spec; `confidence` is NULL from text models and
  a calibrated probability from a provider that has one. **This key is the
  resume story of the whole pipeline**: rerunning after a crash skips every
  judged pair; changing the model or the question automatically re-judges.
- **Fails with:** `OllamaCallFailed` (unit, cause) — HTTP/process errors.
  An answer that is not yes/no is not an error: the pair is asked once
  more, and if the answer is still untyped the verdict is journaled as
  `abstain` (treated as "no", but stored distinctly so a rash of them is
  visible in the log and the table).
- **Retry:** `OllamaCallFailed`: backoff + jitter, 3 attempts (the server may
  be reloading a model); exhausted, the error stops the run — the next
  retry resumes from the journal, every judged pair already cached.
  Untyped answer: one re-ask; then abstain.
- **Tripwire:** experiment 002's scar. If the first 100 *fresh* verdicts
  (cached ones do not count) are unanimously "no" — or unanimously "yes" —
  abort with `VerdictsSuspicious` (judged, yes, no, reason). A one-sided
  verdict stream means the prompt or model is broken, and 20 more minutes
  of it teaches nothing.

### 5. Cluster

Union-find over yes-edges, then a density gate: a cluster is accepted only if
its internal yes-density (yes-edges / judged-edges within the cluster) clears
a threshold (`DENSITY_MIN` = 0.5; components of two are exempt); sprawling
low-density blobs are split by dropping their weakest bridges (experiment
002 failure mode 1: transitive chaining welded India's resignation,
pellet-gun videos, and a podcast into one 11-item "event"). The split is a
shear by triangle support: a yes-edge survives only if the pair has at
least *k* common yes-neighbours inside the component — accounts of one
event vouch for each other many times over; a bridge between events has
few mutual friends. *k* rises from 1 to `SUPPORT_CEILING` (6) until the
component breaks, and the pieces are gated and sheared again. A component
that survives the ceiling intact is emitted as measured, for stage 5c to
set aside. No model is asked anything in stage 5; it is arithmetic over
stage 4's verdicts. Only clusters spanning at least two outlets are kept.

- **In/Out:** verdicts → event clusters
- **Tables:** `clusters` (run_id, cluster_hash, density, was_split,
  item_count, outlet_count, sides, created_at), `cluster_items` (run_id,
  cluster_hash, item_id) — derived but persisted, because stages 6-11
  reference cluster hashes and the editor may correct them; an editor
  correction is ground truth and is never silently recomputed away — it is
  also, over months, the labeled dataset that could someday demote the
  judging model to something cheaper. Until corrections exist, a rerun
  replaces the day's rows wholesale.
- **Fails with:** nothing.

### 5c. The density floor

A cluster still under `DENSITY_MIN` after the shear is a welded blob the
triangle test could not cut — digest hubs give cross-story bridges genuine
triangle support (the 2026-07-31 front page was one 105-item blob). Not
printable, and not eligible for the fold nomination either: set aside,
logged with its item count, outlet count, and density, and listed in the
stage-11 report. (The stage letters are the order the stages were built;
5c runs before 5b.)

- **In/Out:** event clusters → printable clusters (blobs set aside)
- **Tables:** none — the blobs are already in `clusters` as measured.
- **Fails with:** nothing.

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
- Rank by breadth (outlets, then sides, then items), cap the day's brief
  at a fixed story count (`STORY_CAP` = 8). It ends (§7); the cap is the
  design, not a limitation.

- **Tables:** `stories` (run_id, cluster_hash, rank, balance_note, status,
  reason, fold_reason)
- **Fails with:** nothing. Zero stories is not an error: it is a valid
  Edition — the quiet page — and the brief for a quiet day prints, says so,
  and ends. (Distinct from `NoEdition`; see "The joint".)

### 6b. The below-the-fold nomination

One model pick from OUTSIDE the selected front page (experiment 003's sole
survivor): the story whose consequence most exceeds its coverage. Strictly
additive — it can never reorder or displace the main stories. The
nomination reason is printed verbatim in the brief; the editor grades it by
reading and kills the feature with `below_the_fold = false` in the masthead
file. Candidate lists are always shuffled (003 run 1: position bias). Any
failure here degrades to "no nomination today," reported, never fatal.

- **Tables:** `stories` (fold_reason column)
- **Fails with:** `OllamaCallFailed` (2 attempts, backoff + jitter) or an
  untyped answer; either way it degrades quietly to no nomination.

### 7. Fetch articles

For each selected story, fetch the full article behind each member item's
link. Front door, honest UA, a flat 300 ms politeness delay before every
request. Extract body text (readability-style extraction, then HTML-strip)
and the outlet's own link-preview image (`og:image`, hotlinked with
credit, never rehosted).

- **Tables:** `articles` (item_id, status, http_code, text, og_image,
  fetched_at) — keyed by item; a rerun refetches only what is missing or
  failed, and an account stage 2b already read from the feed is never
  fetched at all.
- **Fails with:** `ArticleUnfetchable` (outlet, url, cause, transient) ·
  `ArticleUnreadable` (outlet, url — fetched but extraction produced
  nothing usable).
- **Retry:** as stage 1 (backoff, timeouts/5xx only, closed doors fail fast).
- **Degradation:** an account that cannot be fetched **drops out of the
  composite** — the sources line names only accounts actually read (§3:
  nothing unattributed ships; a summary we half-read is not a source). If a
  story falls below 2 fetched outlets, it is dropped and the drop is
  reported. Incomplete beats wrong (§5). Text-only mirrors are legitimate
  front doors and are tried first when one is known; the known ones are
  code, not configuration (`mirrorUrl` in `platform/src/articles.ts` —
  today only NPR → text.npr.org), and the masthead admits no mirror key.

### 8. Composite

For each story: hand the compositor the fetched accounts, get back the
four-part brief (headline · body · where-the-accounts-differ · sources).
Model: the larger local model (8B-class); this stage is low-volume — a
handful of stories — and can afford deliberation. Prompt encodes the
experiment-001 rules: no ungiven adjectives, no motive, no forecast,
attribute anonymous quotes to the outlet that carried them, ≤ 350 words,
it ends.

The context window is finite; a nine-account cluster is not. At most
`MAX_PROMPT_ACCOUNTS` (6) accounts go into the ask: one per outlet first
(the longest text wins), then extras by length. The printed sources line
is arithmetic, not prose — exactly the outlets whose accounts were in the
ask (§3: only accounts actually read). The model still emits a SOURCES
section as a format anchor, but its content is discarded: an 8B model
attributing its own reading is a hallucination surface, not a record.

- **Tables:** `drafts` (cluster_hash, model, prompt_hash, attempt,
  headline, body, differ, sources_line, raw, created_at) — cache-keyed like
  verdicts; a crash mid-composite loses one draft. The journal keeps what
  the model wrote; the printed sources line is recomputed on every path,
  journal reloads included.
- **Fails with:** `OllamaCallFailed`, plus `DraftMalformed` (clusterHash,
  raw — the four-part shape did not parse) and `PressStalled` (clusterHash,
  cause; fatal — the compositor stopped answering).
- **Retry:** `DraftMalformed`: one re-ask; then the story is dropped and
  reported. We do not ship a brief whose shape we had to guess at.
  `OllamaCallFailed`: backoff + jitter, 3 attempts; then the run aborts
  with `PressStalled`. A press that cannot reach its model stops loudly —
  it does not absorb timeouts as story drops and publish an empty paper
  (2026-08-02: eight straight 5-minute timeouts printed a 0-story edition,
  which suppressed the email and armed the already-published guard against
  every hourly retry).

### 9. Verify

Deterministic checks against the fetched source texts — the cage around the
compositor (experiment 001: the model's only failure class was *attribution
laundering*, a source's characterization drifting into eto's own voice; every
instance was mechanically detectable):

**Violations** (each one is a defect the story must not ship with):

- A quoted fragment (12 characters or more, between double quotes) not
  found verbatim in any fetched account.
- The sources line names fewer than two outlets, or names an outlet whose
  account was not fetched.
- The prose refers to "account N" — prompt scaffolding leaking into what
  the reader sees (the 2026-08-01 Ceuta story).
- The brief (headline, body, and differ block together) runs over the hard
  cap of 420 words.

**Advisories** (journaled and printed in the report; they never drop a
story):

- A named entity in eto's voice that appears in no account — advisory
  until the false-positive rate has been measured.
- Over the 350-word budget but under the 420-word cap.
- An outlet fetched but not named in the sources line.

There is no adjective check: the compositor's prompt forbids ungiven
adjectives, and nothing verifies that it obeyed. (The four-part shape is
stage 8's concern — a draft without it never reaches the verifier.)

Violations produce editor-style notes sent back to the compositor for **one**
revision pass (experiment 001 converged in one). Still failing → the story
drops whole, and the report says why. Claims are never cut from a story;
either the brief verifies as written or it does not run. A gap over a
guess, every time (§5).

- **Tables:** `verifications` (cluster_hash, attempt, check, result,
  detail, verified_at) — one row per violation or advisory, or one `pass`
  row when there were none.
- **Fails with:** `BriefUnverifiable` (clusterHash, violations) — terminal
  for the story, never for the run. `OllamaCallFailed` on the revision pass
  escalates to `PressStalled` exactly as in stage 8.

### 10. Render and archive

Assemble surviving briefs into the day's edition: stories in rank order, each
with its sources line; corrections section up front when a prior brief needs
one — dated, pointing back, never editing the old file (§9). Write to
`archive/YYYY-MM-DD.md`. The write refuses to overwrite: if the path exists,
that is `BriefAlreadyPublished` (date, path), and it means a human is doing
something odd (or two runs raced) — either way, stop. (`ETO_REPUBLISH=1`
in the environment lets the write overwrite today's file, loudly; a
development escape hatch, never set by any verb.)

Once the archive write has succeeded, the frame writes the
**published-edition store** — `published_stories`, the archive's queryable
shadow: one row per printed story with its headline, body, differ block,
sources line, resolved source links, balance note, fold reason, and the
engine's opaque `engine_ref`. The site, email, and RSS dialects read from
it (the legacy `stories` × `drafts` join is consulted only for editions
published before the store existed). Written after the archive and
idempotently by `run_id`, so the two can never disagree.

- **Tables:** `published_stories` (written); `corrections` (pending rows
  marked `printed_in`); `runs` gets its terminal row (finished_at, notes —
  the story count and engine name).
- **Fails with:** `BriefAlreadyPublished` (date, path).
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

## The joint (generation 2)

The platform and an engine meet exactly once per run:

```
frame:   preflight → runs row → ┐
                                ├─ engine.edition({ runId, masthead })
frame:   corrections ← render ← ┘ ← Edition | NoEdition
         archive → published_stories → runs finish
```

- **Day carries no corpus.** The eto engine builds its own from the
  platform's feed library; the desk engine reads the Desk; a future engine
  reads documents or APIs. The platform hands an engine the morning, not a
  worldview.
- **The report is engine-authored.** The funnel, the drops, the health
  lines are the engine's account of its own morning; the frame renders
  them.
- **`NoEdition` is an outcome, not an error** — distinct from an Edition
  with zero stories (the quiet page, which prints). The 2026-08-02
  incident is why the distinction is load-bearing.
- **Capabilities, not ambient authority.** An engine runs with the journal
  (SQL), the platform's front-door fetch libraries, the pinned inference
  boundary (see Cross-cutting machinery), and the Desk. It is never handed
  the filesystem, the archive, the mail, or the readers.
- The `Engine` interface is **private to the monorepo** until the engine
  ladder has enough rungs to extract a public contract from.

## Cross-cutting machinery

**Effect mapping.** Each stage is an `Effect` with its failure types in its
signature; the run is an `Effect.gen` script that reads exactly like the list
above. Retry policies are `Schedule` values owned by the stage. External
services (HTTP, SQLite, Ollama, clock) are Layers — the test suite swaps in
fakes, which is how prompt probes and failure-path tests run without a GPU or
a network. Every stage and unit of work is a span; spans carry the ids that
the tables use, so a trace, a log line, and a row can always be joined.

**The inference boundary.** The stages never talk to a model; they ask the
`Inference` service one of a closed set of typed questions — same event
(stage 4), the below-the-fold nomination (6b), the composite (8, and 9's
revision pass) — and get typed answers back. There is deliberately no
generic "chat" on that interface: a future provider that returns typed
decisions instead of text must still be able to satisfy it, so the boundary
speaks in questions, never in prompts. Prompts, completion parsers, and
per-model knobs are the Ollama provider's business
(`platform/src/inference-ollama.ts`); what stays in the stages is every
policy around an answer — retries, the re-ask-then-abstain rule,
journaling, attempt numbering, tripwires. The journal keys don't change:
`model` is the provider's model identity and `prompt_hash` is the hash of
the provider's question spec, so resume and invalidate-on-change work as
they always have. Each verdict also carries a `confidence` column — NULL
from text models, a calibrated probability from any provider that has one.
Preflight pins through the provider's `pin()`: it answers with each model
and the strongest identity it can promise (Ollama: a content digest; a
provider that cannot promise one returns null, which is logged as
"unpinnable" and never locked — the §10 gap made visible instead of
silent). One provider exists, so there is no selection surface yet: the
registry is code, and the eto.toml key for choosing from it arrives with
the second provider, the same restraint the engine registry practices.

**Tripwires are first-class.** `FunnelAnomalous`, `VerdictsSuspicious` — the
pipeline carries statistical self-checks that abort early when a stage's
output distribution says "misconfiguration" even though every individual call
succeeded. Experiment 002 paid for this lesson; the 0-matches run failed
*silently, politely, and completely*.

**One database, one file.** SQLite at `db/eto.sqlite` (WAL mode). Backup is
copying a file; inspection is `sqlite3` and SELECT; nothing lives at a path
the user can't open. The tables (`platform/src/db.ts`): `runs`,
`feed_fetches`, `items`, `clusters`, `cluster_items`, `articles`,
`stories`, `drafts`, `verifications`, `corrections`, `email_sends`,
`documents` (the FrontDoor's journal — every distinct version of every
watched page, keyed by content hash; the letter engine's memory),
`published_stories`, `verdicts`. The full DB can be rebuilt from the world
except: editor corrections, the source-health history (`feed_fetches`),
the published-edition store, and the send record (`email_sends`) — the
tables that are genuinely ours.

## Error catalog

| Error | Stage | Fields | Retried? | Kills the run? |
|---|---|---|---|---|
| `MastheadInvalid` | 0 (and the eto engine, for an empty source list) | path, reason | no | yes |
| `OllamaDown` | 0 | url, cause | no | yes |
| `ModelMissing` | 0 | model, installed | no | yes |
| `ModelDrifted` | 0 | model, expected, actual | no | yes |
| `BriefAlreadyPublished` | 10 | date, path | no | yes |
| `FeedUnreachable` | 1 | outlet, url, cause, transient | 3×, transient only | no |
| `FeedMalformed` | 2 | outlet, url, cause | no | no |
| `FunnelAnomalous` | 3 | items, candidatePairs, reason | no | yes |
| `OllamaCallFailed` | 4, 6b, 8/9 | unit, cause | 3×, backoff + jitter (2× at 6b) | at 4: yes, once retries are exhausted (the next run resumes from the journal); at 6b: no (no nomination); at 8/9: escalates to `PressStalled` |
| `VerdictsSuspicious` | 4 | judged, yes, no, reason | no | yes |
| `ArticleUnfetchable` | 7 | outlet, url, cause, transient | 3×, transient only | no (account drops) |
| `ArticleUnreadable` | 7 | outlet, url | no | no (account drops) |
| `DocumentUnfetchable` | the FrontDoor (letter engine) | source, url, cause, transient | 3×, transient only | no (the door is absent from the morning; reported) |
| `DraftMalformed` | 8 | clusterHash, raw | 1 re-ask | no (story drops) |
| `PressStalled` | 8, 9 | clusterHash, cause | no (fires after `OllamaCallFailed` retries) | yes |
| `BriefUnverifiable` | 9 | clusterHash, violations | 1 revision | no (story drops) |
| `NoEdition` (outcome, not error) | the joint | reason | n/a | no — true silence: no file, no mail, a note in `runs` |

An untyped verdict (stage 4) and a quiet day (stage 6) are not in the
table because neither is an error: the first is journaled as `abstain`
after one re-ask, the second prints as an Edition with zero stories.

The row-level rule underneath the table: **configuration and distribution
problems kill the run loudly; unit-of-work problems degrade the brief
quietly and honestly.** A missing outlet is a smaller brief. A broken prompt
is a stopped press.
