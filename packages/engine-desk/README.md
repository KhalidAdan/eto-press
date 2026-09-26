# @eto-press/engine-desk

*The editor writes; the press prints.*

The null engine. No feeds, no models, no GPU: whatever you leave as a
markdown file in `desk/` prints once, as a story, in the next edition,
and the platform does the rest — the archive, the site, the mail, the
RSS, the corrections. A morning with nothing new on the desk is
`NoEdition`: no file, no mail, the press rests.

It exists to prove the platform is honest machinery, and to give a
writer a paper on the same constitution as the flagship in under a
minute: `eto init` (choose desk), `npm install`, `eto print`.

Declare it with `[engine] use = "desk"` in `eto.toml`. A desk paper needs
no `[[source]]` blocks and never needs Ollama.

License: AGPL-3.0-only.
