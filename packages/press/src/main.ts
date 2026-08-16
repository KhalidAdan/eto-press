import type { FileSystem, HttpClient } from "@effect/platform"
import { NodeContext, NodeHttpClient, NodeRuntime } from "@effect/platform-node"
import type { SqlClient } from "@effect/sql"
import { SqliteClient } from "@effect/sql-sqlite-node"
import { Effect, Layer } from "effect"
import { mkdirSync } from "node:fs"
import { deskEngine } from "@eto-press/engine-desk/engine"
import { etoEngine } from "@eto-press/engine-eto/engine"
import { ENGINE } from "@eto-press/platform/config"
import { Desk } from "@eto-press/platform/desk"
import type { Engine } from "@eto-press/platform/engine"
import { Ollama } from "@eto-press/platform/ollama"
import { pressRun } from "./run.js"

/** Everything MainLive can provide — the ceiling on what any registered
 * engine may require. */
type PressServices =
  | SqlClient.SqlClient
  | HttpClient.HttpClient
  | FileSystem.FileSystem
  | Ollama
  | Desk

// The engine registry: static, not dynamic — an engine is a dependency
// this press was built with, and eto.toml picks one by name. No plugin
// loading; that interface waits for more rungs on the ladder.
const engines: Record<string, Engine<any, PressServices>> = {
  eto: etoEngine,
  desk: deskEngine
}
const engine = engines[ENGINE]
if (engine === undefined) {
  console.error(
    `eto.toml names engine "${ENGINE}", but this press only knows: ${Object.keys(engines).join(", ")}`
  )
  process.exit(1)
}

// The journal lives in db/ (gitignored); ensure the directory exists before
// the SQLite layer opens the file.
mkdirSync("db", { recursive: true })

const SqlLive = SqliteClient.layer({ filename: "db/eto.sqlite" })

const MainLive = Layer.mergeAll(
  NodeContext.layer,
  NodeHttpClient.layer,
  SqlLive,
  Ollama.Default.pipe(Layer.provide(NodeHttpClient.layer)),
  Desk.Default.pipe(Layer.provide(NodeContext.layer))
)

NodeRuntime.runMain(pressRun(engine).pipe(Effect.provide(MainLive)))
