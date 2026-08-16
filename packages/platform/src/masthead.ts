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

/** Where the side labels came from — a claim the PAPER makes about its
 * own editorial line, rendered on the sources page only when declared.
 * The press asserts nothing it does not know: no seed, no provenance
 * paragraph. */
export const SeedSchema = Schema.Struct({
  name: Schema.NonEmptyString,
  url: Schema.optional(Schema.String),
  version: Schema.optional(Schema.String),
  /** An optional clause appended after the name — e.g. how the chart
   * rates outlets. Reads as: "seeded from {name} ({version}), {description}." */
  description: Schema.optional(Schema.String)
})
export type MastheadSeed = typeof SeedSchema.Type

export const MastheadSchema = Schema.Struct({
  /** Stage 6b kill switch — the editor's, not the model's. Absent = on. */
  below_the_fold: Schema.optional(Schema.Boolean),
  /** Morning email delivery. Absent = off; the editor flips it on when the
   * mail domain is verified and production access is granted. */
  email_edition: Schema.optional(Schema.Boolean),
  seed: Schema.optional(SeedSchema),
  /** May be empty: a desk paper reads no outlets. Whether emptiness is
   * an error is the ENGINE's call — eto refuses to print without sources;
   * the desk engine never looks. */
  source: Schema.optionalWith(Schema.Array(SourceSchema), { default: () => [] })
})
export type Masthead = typeof MastheadSchema.Type

const ROOT_KEYS = new Set(["below_the_fold", "email_edition", "seed", "source"])
const SOURCE_KEYS = new Set(["name", "side", "feeds"])

/** TOML scoping quietly attaches a root key typed below the last [[source]]
 * to that source — a flag the editor believes is set, silently ignored.
 * A known masthead flag found on a source is therefore refused by name;
 * any other unknown key warns but does not stop a morning. */
export const checkUnknownKeys = (path: string, parsed: Record<string, unknown>) =>
  Effect.gen(function* () {
    for (const key of Object.keys(parsed)) {
      if (!ROOT_KEYS.has(key)) {
        yield* Effect.logWarning(`${path}: unknown key "${key}" is ignored by the press`)
      }
    }
    const sources = Array.isArray(parsed["source"]) ? parsed["source"] : []
    for (const [i, s] of sources.entries()) {
      if (typeof s !== "object" || s === null) continue
      for (const key of Object.keys(s)) {
        if (SOURCE_KEYS.has(key)) continue
        if (ROOT_KEYS.has(key)) {
          return yield* new MastheadInvalid({
            path,
            reason:
              `"${key}" appears inside [[source]] #${i + 1} — TOML attaches it to that ` +
              `source, and the press would silently ignore it. Move it to the top of ` +
              `the file, above the first [[source]].`
          })
        }
        yield* Effect.logWarning(
          `${path}: unknown key "${key}" on [[source]] #${i + 1} is ignored by the press`
        )
      }
    }
  })

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
    yield* checkUnknownKeys(path, parsed as Record<string, unknown>)
    return yield* Schema.decodeUnknown(MastheadSchema)(parsed).pipe(
      Effect.mapError(
        (e) => new MastheadInvalid({ path, reason: e.message })
      )
    )
  }).pipe(Effect.withSpan("stage0.loadMasthead", { attributes: { path } }))
