/**
 * The letter engine — an institution speaks, the paper prints.
 *
 * The masthead's [[source]] blocks name the doors to watch: each feed URL
 * is an ordinary page (a statements index, a decisions page, a
 * changelog). Every morning the engine reads each door through the
 * platform's FrontDoor; a door whose content changed becomes a story —
 * the page's own title as the headline, its prose as the body, the
 * source named and linked. A morning where no watched door changed is
 * NoEdition: no file, no mail, the press rests.
 *
 * Deliberately v0: no models, no diffing prose, no stat blocks — those
 * arrive when this engine's papers demand them, extracted rather than
 * guessed. What rung 2 exists to force is the FrontDoor itself and the
 * document journal behind it.
 */
import { SqlClient } from "@effect/sql"
import { Effect } from "effect"
import { editionStoryFrom, type EditionStory } from "@eto-press/platform/edition"
import type { Day, EngineOutcome } from "@eto-press/platform/engine"
import type { FeedOutcome } from "@eto-press/platform/feeds"
import { capText, fetchDocument, recordDocument } from "@eto-press/platform/frontdoor"

/** A body longer than this is a document, not a letter — cap it honestly
 * and let the sources line carry the reader to the full text. */
const BODY_CAP = 2600

const edition = (day: Day) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const doors = day.masthead.source.flatMap((s) =>
      s.feeds.map((url) => ({ source: s.name, url }))
    )

    const stories: Array<EditionStory> = []
    const outcomes: Array<FeedOutcome> = []
    for (const door of doors) {
      const started = Date.now()
      const fetched = yield* fetchDocument(door.source, door.url).pipe(Effect.either)
      if (fetched._tag === "Left") {
        outcomes.push({
          outlet: door.source,
          url: door.url,
          status: "unreachable",
          itemsKept: 0,
          ms: Date.now() - started,
          detail: String(fetched.left.cause).slice(0, 120)
        })
        yield* Effect.logWarning(`  door closed: ${door.source} ${door.url}`)
        continue
      }
      const doc = fetched.right
      const record = yield* recordDocument(day.runId, doc)
      outcomes.push({
        outlet: door.source,
        url: door.url,
        status: "ok",
        itemsKept: record.isNew ? 1 : 0,
        ms: Date.now() - started,
        detail: null
      })
      // "Printed" is the STORE's truth, not the engine's own bookkeeping:
      // a version is due when no published edition carries its ref. A
      // morning that failed after journaling the sighting self-heals —
      // the version prints on the next successful run.
      const printed = yield* sql<{ one: number }>`
        SELECT 1 AS one FROM published_stories
        WHERE engine_ref = ${`letter:${doc.contentHash}`} LIMIT 1
      `
      if (printed.length > 0) continue

      const headline = doc.title ?? `${door.source}: a new statement`
      stories.push(
        editionStoryFrom({
          headline,
          body: capText(doc.text, BODY_CAP),
          differ: "",
          sourcesLine: door.source,
          balanceNote:
            record.previous === null
              ? null
              : `Replaces the version seen ${record.previous.fetchedAt.slice(0, 10)}.`,
          foldReason: null,
          linkByOutlet: new Map([[door.source, door.url]]),
          engineRef: `letter:${doc.contentHash}`
        })
      )
      yield* Effect.logInfo(`  the door spoke: ${headline.slice(0, 70)} (${door.source})`)
    }

    if (stories.length === 0) {
      const reachable = outcomes.filter((o) => o.status === "ok").length
      return {
        _tag: "NoEdition",
        reason: `no watched door said anything new (${reachable}/${doors.length} doors read)`
      } satisfies EngineOutcome
    }

    return {
      _tag: "Edition",
      stories,
      report: {
        feedOutcomes: outcomes,
        dropped: [],
        healthLines: [
          `Watched ${doors.length} door(s); ${stories.length} new statement(s) printed.`
        ]
      },
      advisoryLines: []
    } satisfies EngineOutcome
  }).pipe(Effect.withSpan("letter.edition"))

/** The letter engine: watch the door, print when it speaks. */
export const letterEngine = {
  name: "letter",
  doctrine: [
    "An institution speaks for itself; the paper carries it whole.",
    "Print when the door speaks. Rest when it doesn't.",
    "The source is one, named, and linked — go read the original."
  ],
  models: [],
  edition
} as const
