# Experiment 003 — Can a local model exercise front-page news judgment?

**Date:** 2026-07-26
**Question:** Should an LLM rank the day's stories, guided by a declared desk
note (stated in the masthead, never inferred from behavior)? Baseline: the
breadth ranking (outlets × sides × items) that stage 6 ships today.
**Setup:** llama3.1:8b, temperature 0, the day's real 50 clusters, three desk
notes (control / statecraft / human-impact), one-line printed reason required
per pick. Code: `lab/rank_003.ts`; data: `lab/output/rank-003-2026-07-26.json`.
**Verdict: breadth ranking stays. The model gets, at most, one advisory slot.**

## Settled before the experiment

The masthead already resolves the "what readers would like" framing: §7 bans
recommendation trained on reading behavior. The legitimate target is *news
judgment*. And the day's key realization: **breadth ranking is already
aggregated human editorial judgment** — a cluster spanning FOX, the Guardian,
BBC and Al Jazeera is ~29 news desks independently deciding an event matters,
laundered of any single outlet's bias by requiring disagreement. eto
free-rides on the best relevance signal in existence. No algorithm needed.

## Run 1: position bias, exposed

First attempt: all three desks returned **identical picks, in catalog
order**, with "Teen pleads guilty" ranked under the statecraft desk. The
model walked the list instead of judging it, and ignored the output format.

## Run 2: shuffled decks, strict format

Per-desk deterministic shuffles broke the position bias; desks then produced
genuinely different pages. Grades:

- **Control: B.** Defensible page. One real catch: *1M+ children losing food
  benefits* — consequence the breadth ranking missed (thin coverage).
- **Statecraft: B−.** Houthis/tariffs/ICC promoted as instructed, but
  palace-intrigue items the desk excluded still placed top-5. Hears the
  desk; doesn't obey it.
- **Human impact: F.** Produced a gossip page — political spats and Katy
  Perry above the Berlin attack — and the printed reasons degenerated into
  headline echoes. When reasons stop containing judgment, the ranking has.
- **Baseline breadth ranking: best page on the board** — all eight picks
  were genuinely major stories.

## Conclusions

1. Breadth ranking remains stage 6's spine. It is transparent, deterministic,
   and encodes thousands of human editorial decisions per day for free.
2. 8B-local ranking is desk-sensitive but unreliable, and its reasons are
   post-hoc more often than not. Not shippable as a ranking authority.
3. The one glimmer — surfacing under-covered consequence — suggests a
   contained future role: **one "below the fold" nomination per day**,
   printed with its reason, no power over the real ranking, graded by the
   editor simply by reading it. Kill it if the reasons read like echoes.
4. Method note: any future ranking prompt must shuffle its candidate list;
   run 1's position bias would have silently passed a lazier evaluation.
