# Local models: a working primer for eto

*Written 2026-07-31, from knowledge current to January 2026 — small-model releases move fast,
so check the [Ollama library](https://ollama.com/library) for anything newer before pulling.*

## The one-paragraph answer

Parameter count is a *capacity* limit, not an intelligence rating. What fills that capacity —
training data quality and volume, distillation from a much larger teacher model, and
post-training (instruction tuning, RLHF/DPO) — differs enormously between makers and between
years. The practical rule of thumb: **a well-trained 8B from 2025 beats a well-trained 8B from
2024 decisively, and often beats a 2024 30B.**
(Correction from this doc's first draft: eto's *judge* is already modern — `qwen3:4b-instruct`,
April 2025. It's the *compositor*, `llama3.1:8b`, that is the July 2024 model — and the
compositor is exactly where the fabricated-attribution problem showed up.)

## Why same-size models differ so much

- **Training data.** Modern small models are trained on 10–20T+ tokens of aggressively filtered
  and synthetic-augmented data. Older models used less data, less filtered. This is most of the gap.
- **Distillation.** The best small models are trained to imitate a much larger sibling
  (Qwen3-8B learns from its 235B relative, Gemma from Gemini). The small model inherits judgment
  it could never have learned from raw text at its size.
- **Post-training.** Instruction-following, format compliance ("answer only yes or no"), and
  refusal-to-ramble are all post-training artifacts. This matters directly for eto: a judge that
  reliably ends its answer with a bare yes/no, and a compositor that respects the four-section
  format, are post-training qualities, not size qualities.
- **What size still buys.** Breadth of world knowledge, resistance to confusion in long
  contexts, and multi-step reasoning depth. An 8B will always be more gullible and more
  forgetful than a 70B. The verifier cage exists precisely because of this — no model swap
  removes the need for it.

## The candidates (as of Jan 2026)

| Model | Ollama tag | Size on disk (q4) | Fits 8 GB VRAM? | Notes |
|---|---|---|---|---|
| Llama 3.1 8B | `llama3.1:8b` | 4.9 GB | yes | Current **compositor**. Jul 2024. The baseline to beat. |
| Qwen3 4B instruct | `qwen3:4b-instruct` | 2.5 GB | easily | Current **judge**. Apr 2025, no thinking mode — already a sound choice for the throughput job. |
| **Qwen3 8B** | `qwen3:8b` | ~5.2 GB | yes | Apr 2025. The obvious upgrade: stronger reasoning and instruction-following at the same speed class. Has a thinking mode — disable it for the judge (see below). |
| Qwen3 4B | `qwen3:4b` | 2.5 GB | easily | Already pulled. Shockingly good for 4B, but at judge-quality stakes the 8B is worth the extra VRAM. |
| Gemma 3 12B | `gemma3:12b` | ~8.1 GB | barely / partial offload | Excellent writer for its size. Won't fully fit alongside KV cache on the 2070 — expect partial CPU offload and much slower tokens. Viable for the compositor (9 calls/night), wrong for the judge. |
| Phi-4 14B | `phi4:14b` | ~9.1 GB | no (heavy offload) | Strong reasoning, but oversized for the 2070. |
| DeepSeek-R1 8B distill | `deepseek-r1:8b` | ~5.2 GB | yes | Reasoning-tuned; thinks out loud by design. Wrong shape for a high-throughput yes/no judge; unnecessary for the writer. |
| Mistral Nemo 12B | `mistral-nemo:12b` | ~7.1 GB | tight | Decent all-rounder, mid-2024 vintage — same generation problem as Llama 3.1. |

**Hardware reality:** the RTX 2070's 8 GB is the binding constraint. An 8B at q4 (~5 GB weights
+ KV cache) runs fully on GPU; anything ≥12B spills layers to CPU and throughput falls off a
cliff. That's fine for 9 composite calls a night, fatal for 2,000+ judge calls.

## Thinking vs. non-thinking models

Reasoning models (R1 distills, Qwen3 in thinking mode) emit a long chain of thought before the
answer. For hard one-off questions that buys accuracy. For the judge it buys nothing but
latency: 2,000 pairs × 300 thinking tokens is hours of extra GPU time for a task an 8B can do
directly. Qwen3 is attractive precisely because thinking is *switchable* — off for the judge's
throughput, and optionally on for the compositor where nine slow, careful generations are
affordable. (The judge's `parseVerdict` already strips `</think>` blocks, so eto tolerates
either mode — it's purely a speed decision.)

## Quantization in one paragraph

Ollama's default tags are ~4-bit quantizations (`q4_K_M`): weights compressed to about a
quarter of full precision. The quality loss at q4 is real but small — noticeably smaller than
the gap between model generations, which is why "newer model at q4" beats "older model at q8"
essentially always. Don't spend VRAM on a higher-precision quant of an older model; spend it on
a better model.

## Two jobs, two budgets

| | Judge (`MATCH_MODEL`) | Compositor (`COMPOSITE_MODEL`) |
|---|---|---|
| Calls per night | ~2,000+ fresh pairs | ~9 stories (+1 fold nomination) |
| What matters | consistency, format compliance, throughput | faithfulness, format compliance; speed irrelevant |
| Failure mode | noisy densities → welded or shattered clusters | hallucinated attributions (the fabricated BBC petrol claim) |
| Sensible ceiling | 8B, fully on GPU | 12B with partial offload is affordable |

They're independent knobs in `src/config.ts` — upgrading one doesn't commit you to the other.

A better judge has a compounding effect the writer can't match: **density is a measurement of
the judge.** Sharper yes/nos push real events toward 1.0 and blobs toward 0, which makes the
0.5 floor cleaner on both sides — fewer agonizing 0.49s like the Fauci cluster.

## What benchmarks are worth

Roughly one grain of salt each. Public benchmarks are contaminated (test questions leak into
training data) and small models are aggressively tuned to them. Trust them for ordering model
*generations* ("Qwen3 > Llama 3.1" is real), not for 2-point differences. The only benchmark
that matters here is eto's own corpus, and eto already has the tooling:

- `npm run probe` (`lab/probe-prompts.ts`) auditions a model against known pairs.
- The verdicts journal is a free A/B set: re-judge a few hundred already-judged pairs with the
  candidate model and read the disagreements by hand. Disagreements are where the models'
  quality difference actually lives.

## Mechanics of a swap (eto-specific)

1. `$env:OLLAMA_MODELS = "E:\ollama\models"` before any `ollama pull` — C: is full, models
   live on E: (the paperboy script already sets this for scheduled runs).
2. Change `MATCH_MODEL` (or `COMPOSITE_MODEL`) in `src/config.ts`.
3. Verdicts are keyed by `(item_a, item_b, model, prompt_hash)` — a judge swap automatically
   invalidates the cache and re-judges the whole window on first run: ~11k pairs ≈ 75–90 min
   at current speeds, once. Composite drafts re-generate the same way (9 stories, minutes).
4. `models.lock.json` pins digests per model name. A new name isn't in the lock, so the first
   run pins it automatically; the old entry becomes inert. No manual lock surgery needed.
5. Audition before committing: probe first, and ideally dry-run a full edition in a sandbox
   (copy `db/eto.sqlite`, run from a scratch directory) and read the paper it produces.

## Recommendation

Pull `qwen3:8b` (thinking off) as the judge candidate and probe it. If disagreement review
looks good, promote it. Then, separately, audition it (or `gemma3:12b` if the offload speed is
tolerable) as the compositor. One variable at a time — the journal makes each swap cheap to
audition and cheap to revert.
