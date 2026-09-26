/**
 * The engine registry: static, not dynamic — an engine is a dependency
 * this press was built with, and eto.toml picks one by name. No plugin
 * loading; that interface waits for more rungs on the ladder.
 *
 * Shared by main.ts (which runs the chosen engine) and press-run.ts
 * (which only needs to know whether the chosen engine asks models
 * anything before it bothers waking Ollama).
 */
import type { HttpClient } from "@effect/platform"
import type { SqlClient } from "@effect/sql"
import { deskEngine } from "@eto-press/engine-desk/engine"
import { digestEngine } from "@eto-press/engine-digest/engine"
import { etoEngine } from "@eto-press/engine-eto/engine"
import { letterEngine } from "@eto-press/engine-letter/engine"
import { sportsEngine } from "@eto-press/engine-sports/engine"
import { wrapEngine } from "@eto-press/engine-wrap/engine"
import type { Desk } from "@eto-press/platform/desk"
import type { Engine } from "@eto-press/platform/engine"
import type { Inference } from "@eto-press/platform/inference"

/** Everything the press provides — the ceiling on what any registered
 * engine may require. The journal, the front door, the inference
 * boundary, the Desk: never the filesystem, the archive, the mail, or
 * the readers (Ollama is provided to the boundary, not to engines). */
export type PressServices =
  | SqlClient.SqlClient
  | HttpClient.HttpClient
  | Inference
  | Desk

export const engines: Record<string, Engine<any, PressServices>> = {
  eto: etoEngine,
  desk: deskEngine,
  letter: letterEngine,
  digest: digestEngine,
  sports: sportsEngine,
  wrap: wrapEngine
}
