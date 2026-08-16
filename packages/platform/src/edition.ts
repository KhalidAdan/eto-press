/**
 * The boundary types — what crosses between the engine and the platform.
 *
 * In generation 1 these five types ARE the boundary: the engine's stages
 * produce them, and the platform's article fetcher and render dialects
 * consume them. They live here, on the platform side, so that the
 * dependency arrow only ever points one way (engine -> platform).
 *
 * They are also the ancestors of generation 2's Edition document: when
 * the Engine joint lands, Story/Draft collapse into generic structural
 * blocks with engine-declared ids, and this module becomes EditionResult.
 * Until then, nothing here may grow engine-specific behavior — data only.
 */
import type { Item } from "./normalize.js"

/** An event: the cross-outlet cluster the judge and density gate accepted. */
export interface Cluster {
  readonly hash: string
  readonly items: ReadonlyArray<Item>
  readonly outlets: ReadonlyArray<string>
  readonly sides: ReadonlyArray<string>
  readonly density: number
  readonly wasSplit: boolean
}

/** A selected story: a cluster with its rank and the §6 measurements. */
export interface Story {
  readonly cluster: Cluster
  readonly rank: number
  readonly balanceNote: string | null
  /** Set only on the below-the-fold nomination (stage 6b) — the model's
   * printed, editor-graded reason. Main stories never carry one. */
  readonly foldReason: string | null
}

/** One outlet's fetched, extracted account of a story. */
export interface Account {
  readonly item: Item
  readonly text: string
}

export interface StoryWithAccounts {
  readonly story: Story
  readonly accounts: ReadonlyArray<Account>
}

/** The compositor's four-part output, parsed and attempt-stamped. */
export interface Draft {
  readonly headline: string
  readonly body: string
  readonly differ: string
  readonly sourcesLine: string
  readonly raw: string
  readonly attempt: number
}
