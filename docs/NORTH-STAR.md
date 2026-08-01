# eto

## The Masthead

*One story. Every side. Then it ends.*

---

eto takes a single event, gathers the accounts of it published by outlets that
disagree, and writes one piece of prose that holds all of them. It names every
source it used. Then it stops.

It runs on your machine. The list of outlets it reads is a file you own. That
file is an editorial line, and it is yours — which means that from the moment
you install eto, you are not its reader. You are its editor.

A personal paper is not a private one. An edition can have readers — a
household, a mailing list, the open web — and that is the oldest and best
shape of the press: one editor, a masthead they own, and whoever cares to
read it. eto is built for that shape, and holds one goal it means to keep:
an edition with readers says whose masthead it is, on the page and in the
mail, so any reader can find the editorial line, question it, and — because
the press itself is free — go and run their own. That is not a warning
label. It is the invitation.

---

## The Shape of a Story

```
IDF claims Hamas headquartered under Al-Shifa

  Israeli troops entered Al-Shifa Hospital in Gaza after
  encountering fighters at the gate. The IDF had surrounded
  the hospital, saying Hamas had established a command post
  in tunnels beneath it. Staff were told in advance. Medical
  supplies were brought in.

  Where the accounts differ
  Hamas denies the tunnel claim outright. The Guardian notes
  the search results were unreleased at press time; FOX
  reports White House officials corroborating the Israeli
  account. Reuters attributes the corroboration to unnamed
  officials. No source reports having seen the tunnels.

  Sources  The Guardian · Reuters · FOX
```

Four parts: what happened, where they part company, who said so, and an end.

The third part is old — every honest outlet cites. The fourth is rare. The
second is the one that does not exist anywhere else, and it is the reason to
build this.

---

These are the standards the software keeps so that you can keep the rest.

---

### 1. One story, many mouths.

A story is not a link. A story is an event, and the six or nine competing
accounts of it, collapsed into one telling. If eto cannot find the same event in
sources that disagree, it does not run the story. A single-source item is not a
story. It is a rumour with good manners.

### 2. The disagreement is the story.

Where the accounts conflict, eto says so, in the body, in plain words, with each
side named. It does not average them into a mush that no outlet would recognise
and no reader can check. Consensus manufactured by deleting the contradiction is
not neutrality. It is a quieter kind of lying.

### 3. Nothing unattributed ships.

Every claim traces to a named source. The list at the foot of each story is not
a courtesy and not decoration — it is the proof of work, and it is the reason
the story above it can be believed. A fact eto cannot attribute is a fact eto
cuts.

### 4. The model composites. It does not comment.

The model's job is merge, compress, attribute. It contributes no adjective it
was not given, no motive, no forecast, no implication drawn between two
paragraphs. It is a compositor at a stone, not a columnist. When it strays, that
is a defect, and it is reported and fixed like any other defect.

### 5. Incomplete beats wrong.

The failure mode is omission. Given the choice between a gap and a guess, eto
prints the gap. A brief that admits it does not know is still a brief. A brief
that invents is nothing at all, and it takes every previous brief down with it.

### 6. The masthead is yours.

eto holds no view on what balance means. It enforces the balance you configured
and no other. Change the file, change the paper. It will tell you plainly when
your sources have collapsed onto one side of a story — that is a measurement,
and you are entitled to it. It will not quietly correct you. An editor who can
be overruled by his own press is not an editor.

### 7. The brief ends.

Finite by construction. No infinite scroll, no related stories, no next thing,
no recommendation trained on what kept you reading last time. It ends today the
way it ended yesterday, and you leave. A product that cannot be finished is not
informing you. It is holding you.

### 8. eto reads the front door.

Feeds, APIs, ordinary pages served to ordinary readers. eto does not disguise
itself, does not pretend to be a browser it is not, does not pick a lock a
publisher has closed. A source that must be tricked into being read is a source
eto drops, and the slot is filled from elsewhere on the same side of the aisle —
the spectrum has depth, and no single outlet is owed a place in it. Politeness
is not only ethics here. It is why this runs untouched on your hardware for
years while a cleverer thing would have broken by spring.

### 9. The archive is fixed.

Yesterday's brief is the record of what was known yesterday, and it stays that
way. When a story turns out to have been wrong, the correction runs in today's
brief, dated, pointing back. eto never reaches into what it has already told you
and changes it while you sleep. Being able to watch a story be wrong and then be
corrected is most of what it means to trust it.

### 10. It runs on your metal.

Your machine. Your model. Your electricity. Your source list. No account, no
service, no remote switch. Nobody can change your paper's mind by shipping an
update, including the people who wrote it. The guarantee is not that eto is
trustworthy. The guarantee is that eto cannot become untrustworthy without your
hands on it.

---

### What Success Looks Like

Someone sets up eto because they are tired. Not uninformed — tired. They read
the first brief and it takes six minutes. Somewhere in the second week they
click a source link, because a line about a hospital or a budget or a resignation
seemed too clean, and they find the source says what eto said it said. They do
that maybe four more times over the following months. It checks out each time.
After that they mostly stop checking, and the stopping is earned rather than
lazy.

A year in, they have edited the file twice. Once to drop an outlet that kept
being alone on its own facts. Once to add one, because a brief said *no source
on the right covered this* and they decided that gap was theirs to close. Both
times they understood exactly what they were changing about their own paper.

They do not have the app open now. There is no app. They read the thing in the
morning, they reach the end of it, and they go and do something else — and when
a story breaks that they care about, they find they already have the shape of
it, and the names of the people who disagree about it.

Culvert succeeds by being forgotten. eto cannot; it is the thing being read.
It succeeds by being *finished* — present for a few minutes, trusted because it
was checkable, and then done for the day.

If a brief can be read without the sources ever mattering, we have lost the plot.

---

### What eto is not

**Not a feed.** It has an end. That is the whole design.

**Not a spectrum chart.** Showing you that coverage is fractured is a diagnosis.
eto is supposed to be the treatment: one readable account, sources underneath.

**Not a fact-checker.** It does not rule on who is telling the truth. It tells
you what each said and exactly where they part company, and hands the judgment
back to you, which is where it belongs.

**Not neutral by magic.** It is neutral by construction, and only as neutral as
the file you wrote. Point it at nine outlets that agree and it will faithfully
produce a very confident newspaper about one half of the world.

---

### The Default Masthead

eto ships with a starting source list seeded from the AllSides Media Bias
Chart (v11.3, read 2026-07-25) — the same kind of chart its editor once kept
open in another window while doing all of this by hand. The seed uses the
chart's five labels — left, lean-left, center, lean-right, right — because
balance measured in finer buckets is harder to fool. The audited catalog of
every chart outlet's front door lives in `docs/SOURCES.md`, and the active
list lives in `sources.toml`.

None of this outranks you. The chart is a cartographer, not an editor.
Change the file, change the paper.

---

*A newspaper whose sources you can read — in both senses.*
