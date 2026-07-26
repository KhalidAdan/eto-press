/**
 * The error catalog. Every way the pipeline can fail is a named, structured
 * value listed in docs/PIPELINE.md. An error observed at runtime that is not
 * in this file is itself a bug.
 *
 * The rule: configuration and distribution problems kill the run loudly;
 * unit-of-work problems degrade the brief quietly and honestly.
 */
import { Data } from "effect"

// -- Stage 0: preflight (all fatal) -----------------------------------------

export class MastheadInvalid extends Data.TaggedError("MastheadInvalid")<{
  readonly path: string
  readonly reason: string
}> {}

export class OllamaDown extends Data.TaggedError("OllamaDown")<{
  readonly url: string
  readonly cause: unknown
}> {}

export class ModelMissing extends Data.TaggedError("ModelMissing")<{
  readonly model: string
  readonly installed: ReadonlyArray<string>
}> {}

export class BriefAlreadyPublished extends Data.TaggedError(
  "BriefAlreadyPublished"
)<{
  readonly date: string
  readonly path: string
}> {}

// -- Stage 1-2: feeds (per-feed, never fatal to the run) --------------------

export class FeedUnreachable extends Data.TaggedError("FeedUnreachable")<{
  readonly outlet: string
  readonly url: string
  readonly cause: unknown
  /** Timeouts and 5xx are transient (retried); a 403/404 is a closed door. */
  readonly transient: boolean
}> {}

export class FeedMalformed extends Data.TaggedError("FeedMalformed")<{
  readonly outlet: string
  readonly url: string
  readonly cause: unknown
}> {}

// -- Stage 7: articles (account-level: the account drops, never the run) ----

export class ArticleUnfetchable extends Data.TaggedError("ArticleUnfetchable")<{
  readonly outlet: string
  readonly url: string
  readonly cause: unknown
  readonly transient: boolean
}> {}

export class ArticleUnreadable extends Data.TaggedError("ArticleUnreadable")<{
  readonly outlet: string
  readonly url: string
}> {}

// -- Stage 4/5/8: model calls (unit-level, never fatal to the run) ----------

export class OllamaCallFailed extends Data.TaggedError("OllamaCallFailed")<{
  /** Which unit of work was in flight, e.g. "pair 123-456". */
  readonly unit: string
  readonly cause: unknown
}> {}

export class VerdictUnparseable extends Data.TaggedError("VerdictUnparseable")<{
  readonly pairId: string
  readonly raw: string
}> {}

// -- Stage 4: distribution tripwire (fatal) ----------------------------------

export class VerdictsSuspicious extends Data.TaggedError("VerdictsSuspicious")<{
  readonly judged: number
  readonly yes: number
  readonly no: number
  readonly reason: string
}> {}

// -- Stage 3: prefilter tripwire (fatal) -------------------------------------

export class FunnelAnomalous extends Data.TaggedError("FunnelAnomalous")<{
  readonly items: number
  readonly candidatePairs: number
  readonly reason: string
}> {}
