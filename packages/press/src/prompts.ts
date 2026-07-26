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

/** The compositor's standing orders, from experiment 001 and NORTH-STAR §4:
 * merge, compress, attribute — contribute nothing. */
export const COMPOSITE_TEMPLATE =
  "You are a news compositor. Below are {n} accounts of the same event " +
  "from different outlets. Write ONE brief with exactly this structure " +
  "and these literal section markers:\n\n" +
  "HEADLINE: <one plain factual line>\n\n" +
  "BODY:\n<two or three short paragraphs of what happened>\n\n" +
  "WHERE THE ACCOUNTS DIFFER:\n<where the accounts conflict, diverge in " +
  "emphasis, or one reports what another omits — name each outlet plainly. " +
  "Do not manufacture conflict that is not there.>\n\n" +
  "SOURCES: <outlet> - <outlet> - ...\n\n" +
  "Hard rules:\n" +
  "- Use ONLY facts present in the accounts below. Every claim must be " +
  "traceable to at least one account.\n" +
  "- Contribute no adjective you were not given. No motive, no forecast, " +
  "no implication. If an account characterizes something (e.g. calls a " +
  "war unpopular or a politician moderate), attribute the characterization " +
  "to that outlet or its cited source — never state it in your own voice.\n" +
  "- Anonymous quotes stay anonymous, attributed to the outlet that " +
  "carried them (e.g. 'a strategist quoted by FOX News').\n" +
  "- If the accounts leave a gap, say so plainly rather than guessing.\n" +
  "- SOURCES lists exactly the outlets whose accounts you used.\n" +
  "- At most 350 words between HEADLINE and SOURCES. Nothing after SOURCES.\n\n" +
  "{accounts}"

export const COMPOSITE_PROMPT_HASH = createHash("sha256")
  .update(COMPOSITE_TEMPLATE)
  .digest("hex")
  .slice(0, 16)

export interface AccountForPrompt {
  readonly outlet: string
  readonly title: string
  readonly text: string
}

const ACCOUNT_TEXT_CAP = 4000

export const compositePrompt = (
  accounts: ReadonlyArray<AccountForPrompt>
): string =>
  COMPOSITE_TEMPLATE.replace("{n}", String(accounts.length)).replace(
    "{accounts}",
    accounts
      .map(
        (a, i) =>
          `=== ACCOUNT ${i + 1} — ${a.outlet}\nHeadline: ${a.title}\n${a.text.slice(0, ACCOUNT_TEXT_CAP)}`
      )
      .join("\n\n")
  )

export const sameEventPrompt = (a: PromptItem, b: PromptItem): string =>
  SAME_EVENT_TEMPLATE.replace("{outletA}", a.outlet)
    .replace("{titleA}", a.title)
    .replace("{summaryA}", a.summary.slice(0, 250))
    .replace("{outletB}", b.outlet)
    .replace("{titleB}", b.title)
    .replace("{summaryB}", b.summary.slice(0, 250))
