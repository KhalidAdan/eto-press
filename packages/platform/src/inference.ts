/**
 * The inference boundary — the closed set of questions the pipeline may ask
 * a model, as one typed service. There is no generic `chat` here on
 * purpose: a provider that gives up string generation entirely (a typed
 * decision model) must still be able to satisfy this interface, so the
 * boundary speaks in questions and typed answers, never in prompts and
 * completions. Prompts, parsers, and per-model knobs are provider business
 * and live behind it (see inference-ollama.ts).
 *
 * What deliberately stays OUT of the boundary, with the stages that own it:
 * retry policy, the re-ask-then-abstain rule, journaling, attempt
 * numbering, tripwires. A provider answers one question once; every policy
 * around the answer belongs to the pipeline (PIPELINE.md: retry policies
 * are Schedule values owned by the stage).
 *
 * One provider exists today, so there is no selection surface: the
 * registry below is real, the eto.toml key for choosing from it is not.
 * A selector with one selectable value is configuration that cannot be
 * exercised; it arrives with the second provider (the same restraint as
 * the engine registry in press/main.ts — no rungs before the ladder).
 */
import { Effect } from "effect"
import type { Draft } from "./edition.js"
import type { ModelMissing, OllamaCallFailed, OllamaDown } from "./errors.js"
import type { Ollama } from "./ollama.js"
import { makeOllamaProvider } from "./inference-ollama.js"

/** The two sides of a same-event question — outlet named because the
 * question is always cross-outlet. */
export interface PairItem {
  readonly outlet: string
  readonly title: string
  readonly summary: string
}

/** A typed answer to the same-event question. `answer: null` means the
 * provider could not produce a typed answer this ask (for a text model, an
 * unparseable completion) — the stage decides what abstention means.
 * `confidence` is null for providers that do not calibrate; a provider
 * that does returns a probability, and the journal keeps it. */
export interface SameEventVerdict {
  readonly answer: "yes" | "no" | null
  readonly confidence: number | null
  readonly raw: string
}

/** One below-the-fold candidate, already shuffled and labeled by the
 * stage — the provider sees opaque ids and one line per story. */
export interface FoldCandidate {
  readonly id: string
  readonly line: string
}

/** The nomination: a candidate id plus the reason printed verbatim in the
 * brief (experiment 003: the reason is the grading surface). */
export interface FoldPick {
  readonly id: string
  readonly reason: string
}

/** One fetched account handed to the compositor. */
export interface CompositeAccount {
  readonly outlet: string
  readonly title: string
  readonly text: string
}

/** What a question's journal rows are keyed by: which model answered, and
 * a hash of the question spec (for a text provider, the prompt template).
 * Change either and stale journal rows invalidate themselves — the cache
 * keys the verdicts and drafts tables already use, unchanged. */
export interface QuestionIdentity {
  readonly model: string
  readonly questionHash: string
}

/** A model the provider runs, with the strongest identity it can promise.
 * `digest: null` is an honest "unpinnable": the provider cannot guarantee
 * the model behind the name never changes underneath the paper. */
export interface PinnedModel {
  readonly model: string
  readonly digest: string | null
}

export interface InferenceApi {
  /** Which provider answered — for logs and the run report. */
  readonly provider: string
  /** Journal cache keys for the questions that are journaled. */
  readonly identities: {
    readonly sameEvent: QuestionIdentity
    readonly composite: QuestionIdentity
  }
  /** Stage 4: same news event? */
  readonly sameEvent: (
    a: PairItem,
    b: PairItem,
    unit: string
  ) => Effect.Effect<SameEventVerdict, OllamaCallFailed>
  /** Stage 6b: one pick from outside the front page, with its reason.
   * `pick: null` means no typed answer came back; `raw` is always returned
   * so the stage can log what the provider actually said. */
  readonly nominate: (
    candidates: ReadonlyArray<FoldCandidate>,
    unit: string
  ) => Effect.Effect<{ readonly pick: FoldPick | null; readonly raw: string }, OllamaCallFailed>
  /** Stages 8-9: the four-part brief from the fetched accounts, or null if
   * the answer did not take the four-part shape. `revisionNotes` carries
   * stage 9's editor notes for the one revision pass. */
  readonly composite: (
    accounts: ReadonlyArray<CompositeAccount>,
    opts: {
      readonly attempt: number
      readonly revisionNotes?: string | undefined
      readonly unit: string
    }
  ) => Effect.Effect<Draft | null, OllamaCallFailed>
  /** Stage 0: the provider's models with the strongest identity it can
   * promise for each. Fails ModelMissing if a configured model is not
   * available to answer with. */
  readonly pin: () => Effect.Effect<ReadonlyArray<PinnedModel>, OllamaDown | ModelMissing>
}

/** The provider registry — static, like the engine registry in
 * press/main.ts: a provider is a dependency this press was built with. */
const providers: Record<string, Effect.Effect<InferenceApi, never, Ollama>> = {
  ollama: makeOllamaProvider
}

export const INFERENCE_PROVIDER = "ollama"

export class Inference extends Effect.Service<Inference>()("Inference", {
  effect: providers[INFERENCE_PROVIDER] ?? Effect.die(
    `inference provider "${INFERENCE_PROVIDER}" is not in the registry: ${Object.keys(providers).join(", ")}`
  )
}) {}
