import { NodeContext, NodeHttpClient, NodeRuntime } from "@effect/platform-node"
import { SqliteClient } from "@effect/sql-sqlite-node"
import { Effect, Layer } from "effect"
import { mkdirSync } from "node:fs"
import { nightly, Ollama } from "./press.js"

// The journal lives in db/ (gitignored); ensure the directory exists before
// the SQLite layer opens the file.
mkdirSync("db", { recursive: true })

const SqlLive = SqliteClient.layer({ filename: "db/eto.sqlite" })

const MainLive = Layer.mergeAll(
  NodeContext.layer,
  NodeHttpClient.layer,
  SqlLive,
  Ollama.Default.pipe(Layer.provide(NodeHttpClient.layer))
)

NodeRuntime.runMain(nightly.pipe(Effect.provide(MainLive)))
