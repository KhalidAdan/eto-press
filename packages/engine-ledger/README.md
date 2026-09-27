# @eto-press/engine-ledger

*The numbers speak; the ledger arranges them.*

The lay of the land as of yesterday — the business desk and the sports
desk in one engine. Three anatomies, in this order:

1. **The board.** Sources with `kind = "door"` are data doors — JSON or
   plain-text endpoints, an optional `#dot.path` naming the value — and
   `side` names the board they sit on ("Markets", "Scores"). Every figure
   prints with its motion since the last edition, measured against what
   the reader last saw.
2. **The columns.** The editor's signed pieces from the section's desk
   (`# headline`, `by: Name`, then the take). A byline always means a
   human.
3. **The desk.** Sources without a kind are writers' and outlets' feeds,
   and `side` names the shelf they sit on ("Markets", "Trade talk"). Every
   new post prints as a row — the title as the link, the outlet, a
   one-line deck. The outlet's own summary is the deck when it has one;
   otherwise the desk's, asked of the inference boundary and caged.

Nothing is composited. Which of the three matters is the reader's.
Nothing moved, nothing new: `NoEdition`. When anything prints, every
board prints, so the section shows the whole state of the world it
watches.

Declare it with `engine = "ledger"` in a `[[section]]` of `eto.toml`. It
needs the judge model for the deck question and never the compositor.

License: AGPL-3.0-only.
