# Experiment 001 — Can a small model be the compositor?

**Date:** 2026-07-25
**Question:** Is a small, cheap model good enough to do eto's core job — merge, compress, attribute, add nothing (NORTH-STAR §4)?
**Method:** Fetch two real accounts of the same event from outlets that disagree, hand them to Claude Haiku 4.5 with a compositor prompt derived from the masthead, grade the output against the masthead line by line, send editorial feedback, grade the revision.
**Verdict: Yes.** Two passes produced a shippable brief. Details below.

---

## The story

Maine Democrats nominated Troy Jackson as their U.S. Senate candidate at a convention in Bangor on 2026-07-25, replacing Graham Platner. Chosen because the two accounts frame the same event very differently:

- **FOX News** — ["Maine Democrats crown Troy Jackson as Platner replacement as fresh scrutiny clouds Senate reset"](https://www.foxnews.com/politics/maine-democrats-crown-troy-jackson-platner-replacement-fresh-scrutiny-clouds-senate-reset)
- **NPR** — ["Democrats in Maine formally nominate Troy Jackson as their new candidate for U.S. Senate"](https://www.npr.org/2026/07/25/nx-s1-5902982/democrats-maine-senate-race)

Both full texts were fetched and pasted into the compositor prompt. The overlap was found by pulling both outlets' RSS feeds and reading the headline lists side by side — i.e., the clustering step was done by hand this time.

## Incidental finding: the front-door survey

Attempting to gather accounts, using ordinary fetches with an honest user agent (NORTH-STAR §8):

| Outlet | Result |
|---|---|
| FOX News (RSS + article) | Open |
| NPR (RSS) | Open |
| NPR (article, main site) | Timed out twice; **text.npr.org served the full article instantly** |
| BBC (RSS) | Open |
| The Guardian | Fetch blocked outright |
| CNN | HTTP 451 (refused for legal reasons) |
| NBC News | HTTP 403 |
| The Hill | Search worked; article fetch 403 |

Lesson: §8 will shape the source list at least as much as politics does. Text-only mirrors (text.npr.org, lite.cnn.com etc.) are worth cataloguing. RSS itself was universally open.

## The compositor prompt (v1)

Instructed the model to produce the four-part shape (headline / body / "Where the accounts differ" / sources line) with the masthead's hard rules restated: no adjective not given by a source, nothing unattributed, incomplete beats wrong, anonymous quotes credited to the carrying outlet, ≤350 words, it ends.

## Draft 1 — grade: A−

Every factual claim traced to a source (checked line by line). Nothing invented — no motives, no forecasts. The differ section correctly caught both real divergences:

1. FOX carried Republican "coronation"/process criticism; NPR omitted it entirely.
2. NPR's "party officials see the Maine contest as one of their best opportunities" directly conflicts with FOX's anonymous strategist: "Democrats should not be looking to Maine to flip the Senate."

Defects found (all small, all mechanically detectable):

1. **Attribution laundering** — "President Trump's unpopular war with Iran" stated in the brief's own voice; both sources attribute unpopularity to polls/voters. This was the most important defect class of the test: not invention, but a source's attributed characterization quietly becoming stated fact.
2. Same class: "Collins, a moderate Republican" — FOX's characterization, unattributed.
3. "Most significantly" in the differ section — the compositor ranking disagreements is commentary.
4. "inadequate vetting timeline" — neither source said "inadequate."
5. ~430 words, over the 350 budget.

## Draft 2 — grade: A (clean)

All five defects fixed. Notably, 1 and 2 were fixed by **omission rather than attribution** — the masthead-correct choice (§5, incomplete beats wrong). The revision also promoted a subtle divergence to the differ section on its own judgment call: FOX printed "allegation of rape," NPR printed "sexual assault" — a real difference in what each newsroom chose to say. Final text:

> **Maine Democrats nominate Troy Jackson to replace Platner as Senate candidate against Collins**
>
> Maine Democrats on Saturday officially nominated Troy Jackson, a former state Senate president and fifth-generation logger, as their candidate for U.S. Senate. Jackson won 566 of 571 convention delegates, replacing Graham Platner, who withdrew earlier this month after allegations of sexual assault. Platner has denied the allegation.
>
> Jackson, a onetime conservative Republican who switched parties over two decades ago, is running on a populist economic platform mirroring Platner's approach. He backs Medicare for All, tax increases on the wealthy, abolishing ICE, opposing military aid to Israel, and federalized abortion rights—positions on which he has evolved from earlier stances. He has support from Bernie Sanders' Our Revolution group, progressive House member Ro Khanna, and Maine labor unions.
>
> Recent reporting has surfaced concerns about Jackson's temperament and workplace conduct. Anonymous Democratic strategists quoted by Fox expressed worry about a "rocket vetting process," with one consultant stating "it's very clear that Democrats should not be looking to Maine to flip the Senate," citing better opportunities in Texas, Iowa, and Alaska. Jackson defended himself, saying he has been vetted over his 20 years in the legislature. He will face Collins, a Republican seeking her sixth term after 30 years in the Senate, who holds an $11 million cash advantage over Jackson's $1 million-plus raised since announcing his bid.
>
> **Where the accounts differ:**
>
> Fox News emphasizes vetting concerns and features Democratic strategists expressing pessimism about Maine as a flipping opportunity. NPR, while noting questions about whether Jackson can command Platner's enthusiasm, quotes Democratic officials and supporters more positively about his progressive record. Fox reports Republican criticism of the delegate selection process as a "coronation"; NPR does not include these Republican charges. NPR states "party officials see the Maine contest as one of their best opportunities," conflicting with the Fox strategist's assessment that Democrats should not target Maine. Additionally, Fox reports an allegation of rape against Platner, while NPR reports an accusation of sexual assault.
>
> Sources · Fox News · NPR

## Conclusions

1. **The compositor job is within reach of small models.** Haiku 4.5 needed one round of feedback to go from A− to clean. The failure mode was never invention; it was attribution laundering — and that is checkable by comparing draft phrases against source text, no intelligence required.
2. **The pipeline this implies:** composite → attribution check → revise. All three steps are small-model-sized. The checker can be dumber than the compositor.
3. **Clustering looks tractable.** RSS supplies headline + summary + timestamp free of scraping. Same-event matching within a time window is an easier task than compositing ("are these two items about the same event, yes or no"), and at personal-source-list scale even brute-force pairwise comparison is cheap.

## Not tested yet

- End-to-end clustering from raw feeds (the story pair was matched by eye).
- A true local model under Ollama/llama.cpp rather than Haiku over an API.
- More than two sources; sources that disagree on facts rather than framing.
- The automated attribution checker (defects were found by a human-grade review pass this time).
