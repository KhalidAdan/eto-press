/**
 * Prompts are versioned artifacts (docs/PIPELINE.md, principle 4). The hash
 * of the template is part of the cache key of any work it produced — change
 * a prompt and its stale outputs invalidate themselves.
 *
 * Wording matters enormously: experiment 002's first run answered "no" to
 * 300 straight pairs, known positives included, because one sentence was too
 * strict. Any change here must pass `npm run probe` before judging real data.
 */
import { createHash } from "node:crypto"

export interface PromptItem {
  readonly outlet: string
  readonly title: string
  readonly summary: string
}

export const SAME_EVENT_TEMPLATE =
  "ITEM A ({outletA}): {titleA}\n{summaryA}\n\n" +
  "ITEM B ({outletB}): {titleB}\n{summaryB}\n\n" +
  "Are these two items covering the same news event? Two items about " +
  "the same person or topic but different happenings are different " +
  "events. Answer with exactly one word: yes or no."

export const SAME_EVENT_PROMPT_HASH = createHash("sha256")
  .update(SAME_EVENT_TEMPLATE)
  .digest("hex")
  .slice(0, 16)

export const sameEventPrompt = (a: PromptItem, b: PromptItem): string =>
  SAME_EVENT_TEMPLATE.replace("{outletA}", a.outlet)
    .replace("{titleA}", a.title)
    .replace("{summaryA}", a.summary.slice(0, 250))
    .replace("{outletB}", b.outlet)
    .replace("{titleB}", b.title)
    .replace("{summaryB}", b.summary.slice(0, 250))
