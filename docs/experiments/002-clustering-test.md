# Experiment 002 — Can a local model cluster same-event stories from raw RSS?

**Date:** 2026-07-25
**Question:** Given only RSS feeds and a local model on consumer hardware, can eto find "the same event, told by outlets that disagree" without a human matching stories (the step experiment 001 did by eye)?
**Hardware:** RTX 2070 (8 GB VRAM), Ollama 0.32.4, qwen3:4b-instruct.
**Code:** `lab/cluster_002.py` · full run data: `lab/output/run-20260725-2053.json`
**Verdict: Yes — with two fixable failure modes.**

---

## Pipeline

1. Fetch feeds from `sources.toml` (8 outlets, honest user-agent). All ten feeds opened. Note: The Guardian and The Hill, which refused Anthropic's hosted fetcher in experiment 001, served this machine without complaint — the blocks were aimed at datacenter crawlers, not readers. §8 and §10 reinforce each other.
2. Normalize to (outlet, side, title, summary, link, timestamp); 48-hour window → **221 items**.
3. Deterministic prefilter (shared capitalized tokens, rare-token exception): **20,413 cross-outlet pairs → 539** model questions (97% cut by plain code).
4. Local model answers one question per pair: same news event, yes or no.
5. Union-find over the yes-edges → clusters.

Runtime: ~23 minutes at 0.4 pairs/s. Fine for a morning paper composed overnight; see "speed levers" below.

## Results

**89 yes-verdicts → 20 multi-outlet clusters.** Highlights:

- **White House Correspondents' Dinner** — 8 items, 6 outlets, all three sides. Perfect.
- **Maine Senate nomination** (the experiment-001 story) — 7 items, 6 outlets, 3 sides. Found without human help.
- **Berlin Pride van attack** — Al Jazeera / FOX / Guardian, matched across very different framings ("LGBTQ event" / "Pride festival" / "Berlin Pride").
- Clean two-source pairs: Hawaii Lt. Gov. indictment, Tony Romo DUI, mail-in voting appeals ruling, ICC prosecutor removal, Trump–EU tech fines.
- **The balance measurement fired on its own**: the Whitmer-endorses-Stevens cluster drew only FOX + Washington Times — both labeled "right" in sources.toml. Exactly the §6 "your sources have collapsed onto one side" signal, observed on day one.

Roughly half the clusters are publication-grade event groups. One outright false marriage in 89 yes-verdicts (two different 49ers training-camp stories).

## Failure modes

1. **Storyline creep via transitive chaining.** Union-find merges A–B–C even when A–C would be judged "no". Worst case: an 11-item India-protests blob spanning the resignation, pellet-gun videos, celebrity-silence coverage, and a podcast. Fix: require internal edge density, not mere connectivity; or a second "split into distinct events" pass on fat clusters.
2. **Opinion/explainer/video items act as glue.** A humor column rode into the cyclospora cluster; explainers dragged unrelated West Bank / Venezuela items together. Fix is deterministic: these items self-identify via URL patterns (`/opinion/`) and title conventions ("Watch:", "– podcast", trailing "| Author"). Tag before matching; exclude or attach as satellites. Event-matching should probably see straight news only.

## The prompt lesson (cost: one wasted 20-minute run)

The first run returned **0 matches in 300+ pairs**. Cause: the pair-prompt included a strictness clause ("same broad topic is NOT enough — must be the same concrete event, same time and place"). A 4B instruct model treats over-constrained criteria as permission to always answer no — including on a known-positive pair it had answered "yes" to under plainer wording. Proven by a three-case probe (`lab/probe_prompts.py`): bare and gently-clarified prompts pass all cases; the strict prompt fails the positive.

**Standing rule this buys:** every model prompt in eto gets a known-answer probe, run like a unit test, before it judges real data. Prompt wording is a defect surface.

A second small lesson: thinking-mode models (qwen3:4b default) burned ~50s/pair reasoning toward one-word answers, and `think:false` / `/no_think` were ignored. The non-thinking instruct variant answers in 2 tokens. Matching is high-volume and needs a model that just answers; compositing is low-volume and can afford deliberation.

## Speed levers (not yet needed)

0.4 pairs/s ≈ 23 min/day at current scale — acceptable for an overnight batch. If needed: shorter prompts (shipped mid-experiment), an embedding-model prefilter between the lexical filter and the LLM (est. 5–10× fewer LLM calls), batching several pairs per prompt.

## Open items

- Mojibake in some Guardian/Al Jazeera titles (encoding handling, cosmetic).
- Cluster-density / split pass (failure mode 1).
- Deterministic opinion/media tagging (failure mode 2).
- False-negative rate unmeasured — needs a hand-labeled day of items to compare against.
- Every run's JSON is a future labeled dataset: editor corrections to clusters accumulate ground truth for eventually demoting the matching LLM to something cheaper, with the archive as the exam.
