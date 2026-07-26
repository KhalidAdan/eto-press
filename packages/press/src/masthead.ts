/**
 * Stage 0 (part): load and validate sources.toml — the masthead file.
 * The file is the user's editorial line; eto validates shape, never opinion.
 */
import { FileSystem } from "@effect/platform"
import { Effect, Schema } from "effect"
import * as TOML from "smol-toml"
import { MastheadInvalid } from "./errors.js"

export const SourceSchema = Schema.Struct({
  name: Schema.NonEmptyString,
  side: Schema.NonEmptyString,
  feeds: Schema.NonEmptyArray(Schema.String)
})
export type Source = typeof SourceSchema.Type

export const MastheadSchema = Schema.Struct({
  /** Stage 6b kill switch — the editor's, not the model's. Absent = on. */
  below_the_fold: Schema.optional(Schema.Boolean),
  /** Morning email delivery. Absent = off; the editor flips it on when the
   * mail domain is verified and production access is granted. */
  email_edition: Schema.optional(Schema.Boolean),
  source: Schema.NonEmptyArray(SourceSchema)
})
export type Masthead = typeof MastheadSchema.Type

export const loadMasthead = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const raw = yield* fs.readFileString(path).pipe(
      Effect.mapError(
        (e) => new MastheadInvalid({ path, reason: `unreadable: ${e.message}` })
      )
    )
    const parsed = yield* Effect.try({
      try: () => TOML.parse(raw),
      catch: (e) => new MastheadInvalid({ path, reason: `TOML: ${String(e)}` })
    })
    return yield* Schema.decodeUnknown(MastheadSchema)(parsed).pipe(
      Effect.mapError(
        (e) => new MastheadInvalid({ path, reason: e.message })
      )
    )
  }).pipe(Effect.withSpan("stage0.loadMasthead", { attributes: { path } }))
