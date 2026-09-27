# @eto-press/engine-shelf

*The writers you follow, one line each.*

The blogs desk. The masthead's sources are writers; `side` names the
shelf a writer sits on ("Tech", "Essays"). Every morning the engine reads
each writer's feed through the front door and prints every new post as
one row: the title as the link, a one-line **deck** that says what the
post says, the writer's own door. Rows are grouped by shelf, in the
masthead's order, newest first within a shelf.

The deck is the copy desk's line, not the author's, and it adds nothing.
When the writer's feed carries its own summary, that summary is the deck
and no model is asked anything. Only a post whose feed carried the full
body, or nothing at all, gets a deck from the desk — the inference
boundary's fifth question — and the desk's deck is refused if it runs
past two sentences or contains a number, a name or a quoted phrase the
post does not. A refused deck prints as no deck. Nothing is retold.

Declare it with `engine = "shelf"` in a `[[section]]` of `eto.toml`
(or `[engine] use = "shelf"` for a whole paper). It needs the judge
model for the deck question and never the compositor. A morning with no
new posts is `NoEdition`: no file, no mail, the press rests.

License: AGPL-3.0-only.
