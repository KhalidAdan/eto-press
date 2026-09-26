# @eto-press/engine-letter

*Watch an institution's door; print when it speaks.*

The masthead's `[[source]]` blocks name the doors to watch — a
statements index, a decisions page, a changelog. Every morning the
engine reads each door through the platform's front-door reader; a
door whose content changed becomes a story, with the page's own title
as the headline and its prose as the body, the source named and linked.
A morning where no watched door changed is `NoEdition`: no file, no
mail, the press rests.

No models, no diffing of prose, no stat blocks — deliberately. Those
arrive when this engine's papers demand them.

Declare it with `[engine] use = "letter"` in `eto.toml`. It never needs
Ollama.

License: AGPL-3.0-only.
