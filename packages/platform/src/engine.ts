/**
 * The joint — the one place an engine and the platform meet.
 *
 * The platform owns the frame of the morning: schedule, preflight, the
 * masthead, the archive, the dialects, the mail. The engine owns the
 * whole middle: how a corpus is built (through platform libraries), what
 * a story is, and how it must be told. They meet exactly once per run,
 * at edition(day).
 *
 * This interface is private to the monorepo, extracted from its second
 * engine (the desk engine), and stays unpublished until the ladder has
 * more rungs — interfaces drawn from n=1 are reliably wrong, and n=2 is
 * only the first time they can be checked.
 */
import type { Effect } from "effect"
import type { EditionStory } from "./edition.js"
import type { Masthead } from "./masthead.js"
import type { RunReport } from "./render.js"

/** What the platform hands the engine: the morning, and nothing else.
 * No corpus — each engine builds its own from the capabilities it uses. */
export interface Day {
  readonly runId: string
  readonly masthead: Masthead
}

export type EngineOutcome =
  /** An edition to print. Zero stories is a valid, honest edition — the
   * quiet page — if the engine's doctrine prints quiet days. */
  | {
      readonly _tag: "Edition"
      readonly stories: ReadonlyArray<EditionStory>
      readonly report: RunReport
      readonly advisoryLines: ReadonlyArray<string>
    }
  /** True silence: no archive file, no mail, nothing. The Fed did not
   * speak; the desk is empty. Distinct from the quiet page by design —
   * the 2026-08-02 incident is why the distinction is load-bearing. */
  | { readonly _tag: "NoEdition"; readonly reason: string }

export interface Engine<E = unknown, R = unknown> {
  readonly name: string
  /** Printable principles — the engine's doctrine. Every paper on this
   * engine inherits these as the editorial half of its own North Star. */
  readonly doctrine: ReadonlyArray<string>
  /** Model names this engine calls. Preflight confirms presence and pins
   * digests; an empty list means the paper never needs Ollama at all. */
  readonly models: ReadonlyArray<string>
  readonly edition: (day: Day) => Effect.Effect<EngineOutcome, E, R>
}
