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

// -- The edition document -----------------------------------------------------
// One typed document, two constructors (the pipeline in memory, the journal
// on disk), four dialects (markdown archive, site, email, RSS). The raw
// fields are the compositor's text verbatim — the archive's record; the
// split fields are the derived form the visual dialects set in type.

export interface SourceLink {
  readonly name: string
  readonly href: string | null
}

export interface EditionStory {
  readonly headline: string
  readonly body: string
  readonly differ: string
  readonly sourcesLine: string
  readonly bodyParagraphs: ReadonlyArray<string>
  readonly differBullets: ReadonlyArray<string>
  readonly differParagraphs: ReadonlyArray<string>
  readonly sources: ReadonlyArray<SourceLink>
  readonly balanceNote: string | null
  /** The stage-6b nomination reason; null on front-page stories. */
  readonly foldReason: string | null
}

export interface EditionCorrection {
  readonly edition: string
  readonly headline: string
  readonly note: string
  readonly storyRank?: number
}

export interface EditionDocument {
  readonly runId: string
  readonly stories: ReadonlyArray<EditionStory>
  readonly corrections: ReadonlyArray<EditionCorrection>
}

/** Split composed prose into paragraphs (blank-line separated, with
 * single-newline fallback). */
export const splitParagraphs = (text: string): Array<string> => {
  const byBlank = text.split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean)
  if (byBlank.length > 1) return byBlank
  return text.split(/\n/).map((t) => t.trim()).filter(Boolean)
}

/** The differ section arrives as either bullets or paragraphs. */
export const splitDiffer = (
  differ: string
): { bullets: Array<string>; paragraphs: Array<string> } => {
  const lines = differ.split(/\n/).map((l) => l.trim()).filter(Boolean)
  const bulletLines = lines.filter((l) => /^[*•-]\s+/.test(l))
  if (bulletLines.length > 0 && bulletLines.length >= lines.length / 2) {
    return {
      bullets: lines.map((l) => l.replace(/^[*•-]\s+/, "")),
      paragraphs: []
    }
  }
  return { bullets: [], paragraphs: splitParagraphs(differ) }
}

/** Map the sources line's outlet names to the account URLs actually read.
 * Names come from the compositor; links come from the journal — fuzzy
 * containment matching, same posture as the verifier. */
export const resolveSourceLinks = (
  sourcesLine: string,
  linkByOutlet: ReadonlyMap<string, string>
): Array<SourceLink> => {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim()
  return sourcesLine
    .split(/[-·,•|]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((name) => {
      for (const [outlet, href] of linkByOutlet) {
        if (norm(outlet).includes(norm(name)) || norm(name).includes(norm(outlet))) {
          return { name, href }
        }
      }
      return { name, href: null }
    })
}

/** The one constructor both sides use: raw compositor text in, the full
 * story — raw plus derived — out. */
export const editionStoryFrom = (opts: {
  readonly headline: string
  readonly body: string
  readonly differ: string
  readonly sourcesLine: string
  readonly balanceNote: string | null
  readonly foldReason: string | null
  readonly linkByOutlet: ReadonlyMap<string, string>
}): EditionStory => {
  const differ = splitDiffer(opts.differ)
  return {
    headline: opts.headline,
    body: opts.body,
    differ: opts.differ,
    sourcesLine: opts.sourcesLine,
    bodyParagraphs: splitParagraphs(opts.body),
    differBullets: differ.bullets,
    differParagraphs: differ.paragraphs,
    sources: resolveSourceLinks(opts.sourcesLine, opts.linkByOutlet),
    balanceNote: opts.balanceNote,
    foldReason: opts.foldReason
  }
}
