/**
 * The Desk — the capability that lets editor-authored copy enter an
 * edition. A paper keeps human writing in desk/ as markdown files; the
 * platform reads them; an engine decides what they mean. This is the
 * only door for content that comes from the editor rather than the
 * world, and it is read-only by construction: engines are never handed
 * the filesystem, only the desk.
 */
import { FileSystem } from "@effect/platform"
import { Effect } from "effect"

export interface DeskEntry {
  /** The file's name inside desk/, e.g. "2026-08-16-on-quiet-days.md". */
  readonly file: string
  readonly content: string
}

export class Desk extends Effect.Service<Desk>()("Desk", {
  effect: Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    return {
      /** Every markdown entry on the desk, sorted by file name. A paper
       * with no desk/ directory simply has an empty desk. */
      entries: Effect.gen(function* () {
        const exists = yield* fs.exists("desk").pipe(Effect.orElseSucceed(() => false))
        if (!exists) return [] as ReadonlyArray<DeskEntry>
        const files = yield* fs.readDirectory("desk").pipe(Effect.orElseSucceed(() => []))
        const entries: Array<DeskEntry> = []
        for (const file of [...files].sort()) {
          if (!file.endsWith(".md")) continue
          const content = yield* fs
            .readFileString(`desk/${file}`)
            .pipe(Effect.orElseSucceed(() => ""))
          if (content.trim().length > 0) entries.push({ file, content })
        }
        return entries as ReadonlyArray<DeskEntry>
      })
    }
  })
}) {}
