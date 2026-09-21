/**
 * The Ollama provider: the inference boundary answered by local text
 * models through the Ollama service. Everything text-model-specific lives
 * here — the prompt templates, the completion parsers, the per-model
 * knobs — so the stages upstream of the boundary never see a prompt or a
 * raw completion again.
 *
 * Prompts are versioned artifacts (PIPELINE.md, principle 4): each
 * template is hashed, the hash is the question spec's identity, and it
 * keys every journal row the question produced — change a prompt and its
 * stale outputs invalidate themselves. Wording matters enormously:
 * experiment 002's first run answered "no" to 300 straight pairs, known
 * positives included, because one sentence was too strict. Any change
 * here must pass `npm run probe` before judging real data.
 */
import { Effect } from "effect"
import { createHash } from "node:crypto"
import { COMPOSITE_MODEL, COMPOSITE_NUM_CTX, MATCH_MODEL } from "./config.js"
import type { Draft } from "./edition.js"
import { ModelMissing } from "./errors.js"
import type {
  CompositeAccount,
  FoldCandidate,
  InferenceApi,
  PairItem
} from "./inference.js"
import { Ollama } from "./ollama.js"

// -- The same-event question --------------------------------------------------

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

export const sameEventPrompt = (a: PairItem, b: PairItem): string =>
  SAME_EVENT_TEMPLATE.replace("{outletA}", a.outlet)
    .replace("{titleA}", a.title)
    .replace("{summaryA}", a.summary.slice(0, 250))
    .replace("{outletB}", b.outlet)
    .replace("{titleB}", b.title)
    .replace("{summaryB}", b.summary.slice(0, 250))

/** The verdict is the last word of the completion, whatever else came out.
 * Exported for lab/judge-eval.ts: candidates must be graded by the same
 * parser production uses. */
export const parseVerdict = (raw: string): "yes" | "no" | null => {
  const afterThink = raw.includes("</think>")
    ? raw.slice(raw.lastIndexOf("</think>") + 8)
    : raw
  const words = afterThink.toLowerCase().match(/[a-z]+/g)
  const last = words?.at(-1)
  return last === "yes" || last === "no" ? last : null
}

// -- The below-the-fold question ----------------------------------------------

const foldPrompt = (candidates: ReadonlyArray<FoldCandidate>): string =>
  "You are the editor's scout for a daily news brief. The front page is " +
  "already chosen; you cannot change it. Below, in random order, are the " +
  "day's remaining multi-outlet stories — candidates for ONE 'below the " +
  "fold' slot: a story whose real-world consequence exceeds the " +
  "attention it got. Prefer concrete consequence for many people " +
  "(health, money, rights, safety, war and peace). Avoid celebrity, " +
  "sports, punditry, and palace politics.\n\n" +
  candidates.map((c) => c.line).join("\n") +
  "\n\nOutput exactly one line, nothing else:\n" +
  "cX — one sentence naming the concrete consequence that earns the slot\n"

/** Pure and probed: pull "cX — reason" out of the model's reply. */
export const parseNomination = (
  raw: string
): { id: string; reason: string } | null => {
  const m = raw.match(/\b(c\d+)\s*[—–:-]+\s*(.+)/s)
  if (!m) return null
  const reason = m[2]!.split(/\n/)[0]!.trim()
  return reason.length < 10 ? null : { id: m[1]!, reason }
}

// -- The composite question ---------------------------------------------------

/** The compositor's standing orders, from experiment 001 and NORTH-STAR §4:
 * merge, compress, attribute — contribute nothing. */
export const COMPOSITE_TEMPLATE =
  "You are a news compositor. Below are {n} accounts of the same event " +
  "from different outlets. Write ONE brief with exactly this structure " +
  "and these literal section markers:\n\n" +
  "HEADLINE: <one plain factual line>\n\n" +
  "BODY:\n<two or three short paragraphs of what happened>\n\n" +
  "WHERE THE ACCOUNTS DIFFER:\n<where the accounts conflict or one reports " +
  "what another omits — name each outlet plainly. State concrete, checkable " +
  "differences: numbers that disagree, claims one outlet carries that " +
  "another lacks, who each outlet attributes a claim to. Never comment on " +
  "coverage style, depth, or level of detail — a sentence like 'X provides " +
  "more detail' is commentary about journalism, not a difference in the " +
  "event, and is banned. Do not manufacture conflict that is not there.>\n\n" +
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
  "- Refer to outlets by name, always. Never write 'account 2' or " +
  "'the third account' — the reader cannot see the accounts, only names.\n" +
  "- If the accounts leave a gap, say so plainly rather than guessing.\n" +
  "- SOURCES lists exactly the outlets whose accounts you used.\n" +
  "- At most 350 words between HEADLINE and SOURCES. Nothing after SOURCES.\n\n" +
  "{accounts}"

export const COMPOSITE_PROMPT_HASH = createHash("sha256")
  .update(COMPOSITE_TEMPLATE)
  .digest("hex")
  .slice(0, 16)

const ACCOUNT_TEXT_CAP = 4000

export const compositePrompt = (
  accounts: ReadonlyArray<CompositeAccount>
): string =>
  COMPOSITE_TEMPLATE.replace("{n}", String(accounts.length)).replace(
    "{accounts}",
    accounts
      // The outlet name IS the account's identity — numbered labels leak
      // into prose as "ACCOUNT 3 reports…" (2026-08-01 Ceuta story).
      .map(
        (a) =>
          `=== ${a.outlet}\nHeadline: ${a.title}\n${a.text.slice(0, ACCOUNT_TEXT_CAP)}`
      )
      .join("\n\n")
  )

/** Pure and testable: pull the four parts out of the model's text, or null.
 * Tolerates markdown bolding and heading marks around the markers. */
export const parseDraft = (raw: string, attempt: number): Draft | null => {
  const cleaned = raw.replace(/\*\*/g, "").replace(/^#+\s*/gm, "")
  const grab = (start: string, enders: ReadonlyArray<string>): string | null => {
    const re = new RegExp(`^\\s*${start}\\s*:?\\s*`, "im")
    const m = re.exec(cleaned)
    if (!m) return null
    const from = m.index + m[0].length
    let to = cleaned.length
    for (const end of enders) {
      const er = new RegExp(`^\\s*${end}\\s*:?`, "im")
      const em = er.exec(cleaned.slice(from))
      if (em && from + em.index < to) to = from + em.index
    }
    return cleaned.slice(from, to).trim()
  }

  const headline = grab("HEADLINE", ["BODY"])
  const body = grab("BODY", ["WHERE THE ACCOUNTS DIFFER"])
  const differ = grab("WHERE THE ACCOUNTS DIFFER", ["SOURCES"])
  const sourcesLine = grab("SOURCES", [])

  if (!headline || !body || !differ || !sourcesLine) return null
  // SOURCES is the last line; anything substantial after it violates "it ends".
  if (sourcesLine.split("\n").length > 2) return null
  return { headline, body, differ, sourcesLine, raw, attempt }
}

// -- The provider -------------------------------------------------------------

export const makeOllamaProvider: Effect.Effect<InferenceApi, never, Ollama> =
  Effect.gen(function* () {
    const ollama = yield* Ollama

    const sameEvent: InferenceApi["sameEvent"] = (a, b, unit) =>
      ollama.chat(MATCH_MODEL, sameEventPrompt(a, b), unit).pipe(
        // A text model calibrates nothing: confidence is honestly null.
        Effect.map((raw) => ({ answer: parseVerdict(raw), confidence: null, raw }))
      )

    const nominate: InferenceApi["nominate"] = (candidates, unit) =>
      ollama
        .chat(COMPOSITE_MODEL, foldPrompt(candidates), unit, { numCtx: 8192 })
        .pipe(Effect.map((raw) => ({ pick: parseNomination(raw), raw })))

    const composite: InferenceApi["composite"] = (accounts, opts) => {
      const base = compositePrompt(accounts)
      const prompt =
        opts.revisionNotes === undefined
          ? base
          : `${base}\n\nEDITOR'S NOTES on your previous draft — fix these and output the corrected brief in full:\n${opts.revisionNotes}`
      // think: false pins the hybrid-thinking compositor to the mode it was
      // auditioned in (the 2026-08-01 paraphrased-quotes edition).
      return ollama
        .chat(COMPOSITE_MODEL, prompt, opts.unit, {
          numCtx: COMPOSITE_NUM_CTX,
          think: false
        })
        .pipe(Effect.map((raw) => parseDraft(raw, opts.attempt)))
    }

    const pin: InferenceApi["pin"] = () =>
      Effect.gen(function* () {
        const installed = yield* ollama.installedModels
        const byName = new Map(installed.map((m) => [m.name, m.digest]))
        const models = [MATCH_MODEL, COMPOSITE_MODEL]
        for (const model of models) {
          if (!byName.has(model)) {
            return yield* new ModelMissing({
              model,
              installed: installed.map((m) => m.name)
            })
          }
        }
        // Ollama exposes content digests, the strongest identity there is.
        return models.map((model) => ({ model, digest: byName.get(model)! }))
      })

    return {
      provider: "ollama",
      identities: {
        sameEvent: { model: MATCH_MODEL, questionHash: SAME_EVENT_PROMPT_HASH },
        composite: { model: COMPOSITE_MODEL, questionHash: COMPOSITE_PROMPT_HASH }
      },
      sameEvent,
      nominate,
      composite,
      pin
    } satisfies InferenceApi
  })
