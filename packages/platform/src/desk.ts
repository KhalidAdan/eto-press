/**
 * The Desk — the capability that lets editor-authored copy enter an
 * edition. A paper keeps human writing in desk/ as markdown files; the
 * platform reads them; an engine decides what they mean. This is the
 * only door for content that comes from the editor rather than the
 * world, and it is read-only by construction: engines are never handed
 * the filesystem, only the desk.
 *
 * Since generation 3 a desk is per section: the frame hands each
 * engine call a Desk that reads `desk/<slug>/` on a sectioned paper and
 * `desk/` on the single-section compatibility paper, so a sports column
 * and a desk essay never print on each other's page. The engine sees
 * the same `entries` either way.
 */
import { FileSystem } from "@effect/platform"
import { Effect } from "effect"

export interface DeskEntry {
  /** The file's name inside the desk directory, e.g. "2026-08-16-on-quiet-days.md". */
  readonly file: string
  readonly content: string
}

/** The entries of one desk directory, sorted by file name. A missing
 * directory is simply an empty desk. */
export const readDesk = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const exists = yield* fs.exists(dir).pipe(Effect.orElseSucceed(() => false))
    if (!exists) return [] as ReadonlyArray<DeskEntry>
    const files = yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => []))
    const entries: Array<DeskEntry> = []
    for (const file of [...files].sort()) {
      if (!file.endsWith(".md")) continue
      const content = yield* fs
        .readFileString(`${dir}/${file}`)
        .pipe(Effect.orElseSucceed(() => ""))
      if (content.trim().length > 0) entries.push({ file, content })
    }
    return entries as ReadonlyArray<DeskEntry>
  })

/** Where a section's desk lives: `desk/` for the compatibility paper,
 * `desk/<slug>/` once the paper declares sections. */
export const deskDir = (sectioned: boolean, slug: string): string =>
  sectioned ? `desk/${slug}` : "desk"

export class Desk extends Effect.Service<Desk>()("Desk", {
  effect: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    return {
      /** Every markdown entry on the desk, sorted by file name. A paper
       * with no desk/ directory simply has an empty desk. */
      entries: readDesk("desk").pipe(Effect.provideService(FileSystem.FileSystem, fs))
    }
  })
}) {
  /** A Desk over one directory — what the frame provides per section. */
  static at = (dir: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      return new Desk({
        entries: readDesk(dir).pipe(Effect.provideService(FileSystem.FileSystem, fs))
      })
    })
}
