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
import type { FeedOutcome } from "./feeds.js"
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

/** One entry in a story's link list — a digest's whole anatomy, and any
 * engine's "further reading". */
export interface LinkItem {
  readonly title: string
  readonly href: string
  readonly note: string | null
}

/** One row of a story's data list — a market wrap's whole anatomy: a
 * labeled figure and, optionally, its motion since the last edition. */
export interface DataItem {
  readonly label: string
  readonly value: string
  readonly note: string | null
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
  /** The engine's own opaque reference for this story (eto: the cluster
   * hash). Lets the dialects enrich a published story from engine caches
   * — card metadata, preview images — when the ref still resolves.
   * Never interpreted by the platform. */
  readonly engineRef?: string | null
  /** Optional anatomy: who wrote this, when a human did (a desk column's
   * author). Engines that never carry bylines never set it. */
  readonly byline?: string | null
  /** Optional anatomy: the story's link list (a digest section's whole
   * body; any engine's further-reading). Empty means absent. */
  readonly links?: ReadonlyArray<LinkItem>
  /** Optional anatomy: the story's data list (a wrap board's whole body
   * — labeled figures with their motion). Empty means absent. */
  readonly data?: ReadonlyArray<DataItem>
  /** Optional anatomy: the one-line deck under the headline — the desk's
   * line, never the author's, and never a model's when the outlet wrote
   * its own. The index dialect prints it; a story without one is indexed
   * by its first sentence. */
  readonly deck?: string | null
}

export interface EditionCorrection {
  readonly edition: string
  readonly headline: string
  readonly note: string
  /** The paper-global print position of the corrected story. */
  readonly storyRank?: number
  /** The section the corrected story printed in. Absent on corrections
   * recorded before generation 3 (they are the single section's). */
  readonly section?: string | null
}

/** One section's stories, flat — what the four generation-2 dialects
 * consume, and what a per-section feed renders. */
export interface EditionDocument {
  readonly runId: string
  readonly stories: ReadonlyArray<EditionStory>
  readonly corrections: ReadonlyArray<EditionCorrection>
}

// -- The run report -----------------------------------------------------------
// Part of the edition (stage 11): the editor's measurement surface,
// printed as data, not advice. Authored by the engine, framed by the
// platform.

export interface RunReport {
  readonly feedOutcomes: ReadonlyArray<FeedOutcome>
  /** The eto engine's funnel. Absent for engines with no funnel to report. */
  readonly funnel?: {
    readonly items: number
    readonly news: number
    readonly candidates: number
    readonly matches: number
    readonly clusters: number
    /** Clusters set aside by stage 5b: already printed in an earlier edition. */
    readonly repeats: number
    readonly selected: number
    readonly published: number
  }
  readonly dropped: ReadonlyArray<{ readonly rank: number; readonly reason: string }>
  /** Clusters set aside by stage 5c: still below the density floor after the
   * splitter — welded blobs, not stories. */
  readonly blobs?: ReadonlyArray<{
    readonly itemCount: number
    readonly outletCount: number
    readonly density: number
  }>
  /** Source-health trends — the §6/§8 instrument panel. */
  readonly healthLines?: ReadonlyArray<string>
}

// -- The paper: sections bound into one morning -------------------------------
// Generation 3. The frame calls each section's engine and binds the
// outcomes into one document; the archive dialect renders it whole, the
// others render it section by section. A paper with one section and no
// absences renders exactly as generation 2 rendered its edition.

/** One section that printed: the engine's outcome, labeled. */
export interface PaperSection {
  readonly slug: string
  readonly name: string
  readonly stories: ReadonlyArray<EditionStory>
  readonly report: RunReport
  readonly advisoryLines: ReadonlyArray<string>
}

/** One section that returned NoEdition while another printed — a warning
 * on the page and in the report (NORTH-STAR §5: quiet is printed). */
export interface AbsentSection {
  readonly slug: string
  readonly name: string
  readonly reason: string
}

export interface PaperEdition {
  readonly runId: string
  readonly sections: ReadonlyArray<PaperSection>
  readonly absent: ReadonlyArray<AbsentSection>
  readonly corrections: ReadonlyArray<EditionCorrection>
}

/** Every story of the paper in print order, each with its section —
 * the order the published store numbers positions in. */
export const paperStories = <S extends Pick<PaperSection, "slug" | "stories">>(
  paper: { readonly sections: ReadonlyArray<S> }
): Array<{ readonly section: S; readonly story: EditionStory }> =>
  paper.sections.flatMap((section) => section.stories.map((story) => ({ section, story })))

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
  readonly engineRef?: string | null
  readonly byline?: string | null
  readonly links?: ReadonlyArray<LinkItem>
  readonly data?: ReadonlyArray<DataItem>
  readonly deck?: string | null
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
    foldReason: opts.foldReason,
    engineRef: opts.engineRef ?? null,
    byline: opts.byline ?? null,
    links: opts.links ?? [],
    data: opts.data ?? [],
    deck: opts.deck ?? null
  }
}
