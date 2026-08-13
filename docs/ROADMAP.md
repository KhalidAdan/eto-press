# Productizing eto

*Agreed 2026-08-13. The North Star (docs/NORTH-STAR.md) is the constitution; this
is the construction plan. Where they conflict, the North Star wins.*

---

## The Diagnosis

Today this repository is one editor's newspaper with the printing press embedded
in it. Engine code, the masthead, the archive, the SES identifiers, the
machine-specific paths, and a personal fallback address all live in one tree,
and the paperboy commits all of it together every morning.

Productizing eto is one structural act — **separating the press from the
paper** — followed by collapsing the dozen invisible setup steps into declared
configuration and a guided first run.

Everything hard is already built and defensible: the pipeline, the error
taxonomy, the verification cage, resume-by-construction, the tests. What blocks
a second user is shallow but pervasive:

1. **No front door.** No README, no `.env.example`, no license. The Pages
   Function bindings (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
   `SUBSCRIBE_SECRET`) are documented nowhere.
2. **Identity hardcoded in three places.** The claret, the wordmark, and the
   SES names are independently duplicated across `src/html.ts`, `src/email.ts`,
   and `functions/_shared.ts`, with a personal address in `send-edition.ts` and
   `lab/ses-setup.ts`.
3. **Machine lock-in.** Absolute `E:\` paths, a PowerShell-only runner, a
   schedule that lives in Windows Task Scheduler rather than in any file.
4. **Engine and content share one lifecycle.** A user cannot pull improvements
   without pulling this paper's editions; a fix cannot ship without them.
5. **The SES cliff.** Domain identity, DKIM, production access, contact list,
   configuration set, IAM user, three secrets across two runtimes — none of it
   discoverable, most of it already automated in a script marooned in `lab/`.

---

## Publicness Is a Ladder

North Star §10 means productizing eto is not making a service of it. It is
making the press installable — and the installation cost must scale with how
public the paper is. Today every user would pay the full price (AWS, Cloudflare,
GitHub, a domain) even to read their own brief. Instead:

**Tier 1 — a paper for yourself.**
Ollama, Node, `sources.toml`. Output is `site/` opened locally or on the LAN.
Zero accounts, zero secrets. Working fifteen minutes after install. This tier
is §10 made literal, and it is the tier everything else is measured against.

**Tier 2 — a paper on the web.**
Add a static host. Publishing is an adapter — Cloudflare Pages, Netlify,
rsync, or a plain folder — named in configuration, not in workflow YAML.

**Tier 3 — a paper with a mailing list.**
Only here does a mail provider enter. The wizard walks the provisioning; the
subscribe functions deploy only for this tier.

Most of the perceived setup burden is not burden. It is Tier 3 cost being
charged to Tier 1 users. The ladder removes it.

---

## The Shape of the Product

### One monorepo, under the `@eto-press` scope

All software lives in a single repository and publishes as scoped packages:

```
eto/                        the product
├─ packages/
│  ├─ press/                @eto-press/press — pipeline, verification, render
│  ├─ cli/                  @eto-press/cli — init, press, doctor, mail setup (bin: eto)
│  ├─ mail/                 @eto-press/mail — SES and SMTP adapters, one interface
│  └─ subscribe/            @eto-press/subscribe — edge functions, deployable template
├─ docs/                    blume content → the docs site
└─ .github/                 publish workflows, path-filtered
```

npm workspaces; one test run across everything; atomic changes across press,
CLI, and mail. The scope is `@eto-press` — decided 2026-08-13, after the
org-creation form rejected `@eto`: a dormant account named `eto` holds the
name with zero packages, and the bare package name `eto` is separately
squatted by an untouched placeholder. Both are textbook candidates for npm's
dispute process, and that errand stays open — but the product does not wait
on it, and `@eto-press` is a name worth keeping regardless: it says what it
is. The CLI binary is plain `eto` either way.

### The paper stays out — and it already has its own repo

The one thing that does not enter the monorepo is a paper. A paper is not
software; it is data with a different lifecycle — machine-authored, committed
daily, never reviewed, append-only forever. In-tree it would drown the
product's history in edition commits, interleave npm tags with mornings, hand
every contributor a growing archive they did not ask for, and quietly invite
the flagship's assumptions back into the engine — today's disease, rebuilt at
scale. The product repo should look like a press, not like one editor's
newspaper with source attached.

Extraction therefore runs the opposite direction from the obvious one: the
engine moves *out* into the new monorepo, and this repository stays behind as
`eto-news` — archive history intact, deploy workflow intact, Cloudflare wiring
intact — becoming customer #1, consuming `@eto-press/press` from npm exactly
the way a stranger would. A paper directory is what `eto init` scaffolds: masthead
configuration, `archive/`, `site/`, `db/`, `.env`.

### Versioning: generation.date.patch

Semantic versioning says nothing a newspaper needs said. eto versions as
**`[generation].[YYYYMMDD].[patch]`** — e.g. `1.20260813.0`:

- **generation** — the major: breaking changes to configuration or CLI.
- **YYYYMMDD** — the release date, one field, no dots (dots would break
  numeric ordering), no leading-zero hazard while years start with 2.
- **patch** — same-day republish counter.

This is valid semver, so npm accepts it and caret ranges behave: `^1.0.0`
tracks every generation-1 release. GitHub tags are freeform and need nothing.
Precedent is already in our own lockfile — `@cloudflare/workers-types`
versions as `5.20260726.1`, the same scheme. A press that ships daily should
have freshness legible in its version string.

### Docs: blume

The docs site is [blume](https://github.com/haydenbleasel/blume) — markdown in
a folder, static Astro output, deploys to Cloudflare Pages (already the host),
MIT, with an eject hatch if outgrown. Lives as the monorepo's `docs/`
workspace.

---

## The Workstreams

### 1. Split press from paper

The engine becomes `@eto-press/press`; a paper becomes a scaffolded directory. The
current repository becomes the first paper. A stranger updates their press
with `npm update` — deliberately, changelog in hand, per §10's
no-remote-switch guarantee — without touching their editions. The cwd-relative
discipline already proven by the dry-run sandbox is what makes this carry.

### 2. One configuration file

The scattered constants fold into the paper's configuration: masthead identity
(name, motto, color, from-address), site URL, model names, mail provider
block, publish adapter block, backup path. `sources.toml` remains what it is —
the editorial line. The three independent copies of the brand palette collapse
to one source of truth read by site, email, and edge functions alike.

### 3. A CLI with three verbs

- **`eto init`** — the wizard. Name the masthead; seed sources from the
  audited AllSides shelf; pick a tier; pull and pin models
  (`models.lock.json` generated, not hand-edited); then run a sandboxed dry
  edition so the first real morning is not the first test.
- **`eto press`** — what `run-eto.ps1` does, cross-platform, with the
  schedule *installed by the CLI* — Task Scheduler on Windows, launchd on
  macOS, cron or systemd on Linux — rather than clicked together by hand.
- **`eto doctor`** — preflight as a user-facing command: Ollama reachable,
  models present and matching the lock, VRAM sanity (the sidecar-contention
  failure mode becomes a named check, not tribal knowledge), feeds reachable,
  mail verified, last edition's status.

The bar for `init` is a specific moment: `npx @eto-press/cli init` asks the paper's
name, prints the masthead in claret in the terminal, pulls models with real
progress, then runs a live dry edition from that morning's actual feeds and
opens it in the browser — **your own front page before you have created a
single account anywhere.** Tier 1's zero-secrets property is what makes the
moment possible; the wizard's job is to not waste it.

### 4. Tame the email cliff

Two moves. First, promote `lab/ses-setup.ts` to `eto mail setup ses` — it
already provisions domain identity, DKIM, contact list, suppression, and the
configuration set; adding the IAM step and secrets wiring reduces the SES
ordeal to one command and two DNS records. Second, a provider interface in
front of sending: SES stays the recommended default for a real mailing list; a
plain-SMTP adapter serves the household tier where nobody wants an AWS
account. The guards in `send-edition.ts` — idempotent sends, suppression
sweep, quota pacing — generalize; only the client swaps.

### 5. Docs and license

README with the tier ladder, a quickstart per tier, `.env.example`, the
secrets inventory written down, and the blume site. **The license is the one
open decision** — an editorial call, not merely a legal one. The North Star's
closing invitation reads copyleft (AGPL keeps a hosted fork honest); MIT
maximizes spread. Undecided as of 2026-08-13.

---

## What This Is Not

- **No hosted eto.** A managed service is a different product with a different
  trust story, and it would hollow out the only guarantee the North Star makes.
- **No Docker-first.** Ollama wants the GPU and the pitch is *your metal*.
  A container is an option later, never the paved road.
- **No configuration sprawl.** The algorithm tunables — `STORY_CAP`,
  `DENSITY_MIN`, the density gates — stay hardcoded. They are §§1–5 in
  executable form: the paper's journalistic standards, not knobs. The masthead
  is yours; the standards are the press's.

---

## The Phases

**Phase 1 — Make it installable.**
Press/paper split, unified configuration, cross-platform runner, README and
license. After this, a technical stranger runs Tier 1 in an evening. The only
phase with structural risk: the split touches the paperboy, the deploy
workflow, and every relative path — and the sandbox discipline has already
quietly de-risked most of it.

**Phase 2 — Make it welcoming.**
`eto init` and `eto doctor`, model management, schedule installation, the dry
first edition. This phase is measured by the first-run moment above.

**Phase 3 — Make it public.**
Publish adapters, `eto mail setup`, the SMTP alternative, the watchdog
generalized to any paper's URL.

**Phase 4 — Make it a project.**
npm distribution under `@eto-press`, generation.date.patch discipline, the blume
docs site, issue templates, and a story for keeping the AllSides seed current
as the chart revises.

---

*The press moves out. The paper stays home.*
