# eto

## The Masthead

*One paper. Several desks. Then it ends.*

---

eto is a daily paper. It has sections, the way a paper on a doorstep has
sections: a brief of the day's events, the markets, the games, the writers
you follow. Each section is printed by its own machinery on its own
principles, from a source list you own. They are bound into one dated
edition every morning. Then it ends.

It runs on your machine. Each section's source list is a file you own, and
each file is an editorial line. From the moment you install eto you are not
its reader. You are its editor, of every section you choose to print.

A personal paper is not a private one. An edition can have readers, a
household, a mailing list, the open web, and that is the oldest and best
shape of the press: one editor, a masthead they own, and whoever cares to
read it. An edition with readers says whose masthead it is, on the page
and in the mail, so any reader can find the editorial line, question it,
and, because the press itself is free, go and run their own. That is not a
warning label. It is the invitation.

---

## The Shape of a Morning

```
eto.                              Saturday, September 26, 2026
One story. Every side.            Business 4 · Sports 3 · Blogs 9

  [ the Current events brief, in full ]

  ────────────────────────────────────────────────────────────

  IN TODAY'S PAPER

  BUSINESS
  Board    S&P 500  6,412  ▲ 0.4      10y  4.11  ▼ 0.03
  Markets  Fed holds, markets shrug
           Two members dissented; the statement dropped "patient".   ft.com
  ...

  SPORTS
  Scores   Raptors 104  Celtics 99      Arsenal 2  Spurs 1
  Column   On the Raptors' bench        by the editor
  ...

  BLOGS
  1  The end of the file system as we knew it
     Argues that sync, not storage, is what an OS sells now.   daringfireball.net
  ...

  That is the paper for today.
```

The brief in full, a rule, and then every other section compressed to one
line per item: what it is, one sentence that says what it says, and where it
came from. The front page is the paper compressed, not the paper advertised.
Each section is one click deeper, at a dated address, and the archive holds
every morning as it was.

---

These are the standards the paper keeps, above every section. Where a
section's own constitution says otherwise, this document wins.

---

### 1. Nothing unattributed ships.

Every item in every section names where it came from and links to it. In the
brief that is the sources line under each story. In the markets it is the
door each figure was read from. In the blogs it is the post itself, one click
away. A line eto cannot attribute is a line eto cuts, whichever desk wrote it.
This is the proof of work, and it is the same proof on every page.

### 2. The masthead is yours. Every masthead.

Each section has its own source file, and each file is an editorial line
that eto enforces and never overrules. The brief's file says which outlets
stand where. The sports file says which leagues. The blogs file says which
writers. eto holds no view on any of it. It will tell you plainly when a line
has collapsed, when a section has gone quiet, when a door has closed. It will
not quietly correct you. An editor who can be overruled by their own press is
not an editor.

### 3. Every section says what it is.

A section is printed by one engine, and an engine carries a doctrine: the
principles it keeps, printable, short. The brief's doctrine is the one that
started this paper, and it applies to the brief alone. The markets desk does
not composite. The blogs desk does not judge. A reader who wants to know what
a section promises can read its doctrine in a minute, and a section that
cannot state its doctrine does not exist.

### 4. The paper ends.

Finite by construction, section by section and as a whole. No section
scrolls, recommends, or relates. Each one ends with a line that says it has
ended, and the paper ends with one more. Only the brief promises how long it
takes to read: six minutes, the same as it always was. The rest is for the
commute and the coffee, read when you have a moment, and it is still finished
when you get there. A product that cannot be finished is not informing you.
It is holding you.

### 5. Quiet is printed, not filled.

A section with nothing to say prints nothing, and the paper says which
sections are absent this morning, on the page and in the report, so that a
silence you did not expect is a silence you can look into. A morning where
every section is silent prints no edition at all. Nothing is padded to keep
a page full.

### 6. eto reads the front door.

Feeds, APIs, ordinary pages served to ordinary readers, in every section. eto
does not disguise itself, does not pretend to be a browser it is not, does not
pick a lock a publisher has closed. A source that must be tricked into being
read is a source eto drops, whichever desk asked for it. Politeness is not
only ethics here. It is why this runs untouched on your hardware for years.

### 7. The archive is fixed.

Yesterday's edition, every section of it, is the record of what was known
yesterday, and it stays that way. A correction runs in today's paper, dated,
pointing back to the section and the item. eto never reaches into what it has
already told you and changes it while you sleep.

### 8. It runs on your metal.

Your machine. Your models. Your electricity. Your source files. No account, no
service, no remote switch. A section that asks a model a question asks it on
your hardware, and a section that asks no questions never wakes the GPU. The
guarantee is not that eto is trustworthy. The guarantee is that eto cannot
become untrustworthy without your hands on it.

---

### What Success Looks Like

Someone reads the brief at breakfast. It takes six minutes and it ends, and
they leave. On the train they open the paper again, skip past the brief, and
read the sports desk: the scores in a table, two columns, a handful of pieces
from writers they chose. At lunch they read the markets and three blog posts
whose one-line decks told them exactly which three. Every page ended. Nothing
suggested a fourth.

A year in they have edited four files, not one. They dropped a league. They
added a writer. They noticed the business desk had gone quiet for two
mornings, read the report, and found a feed had moved. They understood
exactly what they were changing about their own paper each time, because
each section is its own line and none of them is anyone else's.

If a section can be read without its sources ever mattering, that section
has lost the plot, and the paper says so in its own constitution.

---

### What eto is not

**Not a feed.** Every section ends. That is the whole design.

**Not an aggregator.** An aggregator collects whatever arrives. Each of
these sections is an edited line, finite, with a stated doctrine and a
named editor.

**Not one newsletter that became four.** One paper, one masthead, one
morning. The paper on the web is always whole; the morning email carries
the brief and points at the rest.

**Not a hosted service.** There is no eto account and no one to switch it
off. The press is free and the paper is yours.

---

### The Sections

Two weights of document govern a section. The brief has a **constitution**:
it can move a vote, so it is strict, and slow to change. Every other desk has
a **desk note**: what the desk is, what it is not, and what its editor may
change without ceremony.

The flagship, eto.news, prints four. Each has its own document, its own
source file, and its own engine.

| section | document | source file | engine |
|---|---|---|---|
| Current events brief | [`docs/sections/brief.md`](sections/brief.md), the constitution | `sections/brief.toml` | eto |
| Business | [`docs/sections/business.md`](sections/business.md), a desk note | `sections/business.toml` | ledger |
| Sports | [`docs/sections/sports.md`](sections/sports.md), a desk note | `sections/sports.toml` | ledger |
| Blogs | [`docs/sections/blogs.md`](sections/blogs.md), a desk note | `sections/blogs.toml` | shelf |

The brief's constitution is the document this paper was founded on, moved
here unchanged on 2026-09-26. Where the code says *NORTH-STAR §n*, it means
that document's numbering.

None of this outranks you. Add a section, drop a section, change a file,
change the paper.

---

*A newspaper whose sources you can read, in every section, in both senses.*
