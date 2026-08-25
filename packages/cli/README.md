# @eto-press/cli

*The `eto` command — verbs over the press.*

Every verb runs in the current directory — which is to say, in a **paper**:
the directory holding `sources.toml`, `eto.toml`, the journal, and the
editions. Install nothing globally; `npx @eto-press/cli <verb>` works
everywhere, and a paper created by `init` has `eto` available in its own
scripts.

## The verbs

| verb | what it does |
| --- | --- |
| `eto init` | a paper comes into existence (asks three questions) |
| `eto press` | the whole morning: print, render, export, email, backups |
| `eto print` | run the pipeline: gather, judge, composite, verify, archive |
| `eto doctor` | examine the press: models, lock, GPU, feeds, journal, mail |
| `eto models` | `status` \| `pull` \| `pin` — the models, managed not remembered |
| `eto schedule` | install the morning into the OS (`--time 05:30`, `--yes`) |
| `eto render` | render the public site from the journal |
| `eto email` | deliver the latest edition to the reader list (`--test <addr>`) |
| `eto correct` | print a dated correction pointing back at an edition |
| `eto export` | export the journal as diffable JSONL |
| `eto backup` | snapshot the journal (SQLite online backup) |
| `eto backup-readers` | snapshot the reader list from SES |
| `eto gen-functions` | regenerate `functions/_config.ts` from `eto.toml` |

`eto` with no verb prints this table and exits.

Note: `render` expects the paper's stylesheet already compiled
(`tailwindcss -i brief.css -o site/brief.css --minify`).

## How it runs

Each verb loads the press's TypeScript directly via tsx's loader; the
compile-and-dist story arrives with a later generation. Versioning is
`generation.YYYYMMDD.patch` — valid semver, the date is the release day.

License: AGPL-3.0-only.
