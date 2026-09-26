import { NodeContext, NodeHttpClient, NodeRuntime } from "@effect/platform-node"
import { SqliteClient } from "@effect/sql-sqlite-node"
import { Effect, Layer } from "effect"
import { mkdirSync } from "node:fs"
import { SECTIONS } from "@eto-press/platform/config"
import { Desk } from "@eto-press/platform/desk"
import { Inference } from "@eto-press/platform/inference"
import { Ollama } from "@eto-press/platform/ollama"
import { engines } from "./engines.js"
import { pressRun } from "./run.js"

// Every section's engine must be one this press was built with — checked
// here, before any layer is built, so the message is the first line out.
for (const section of SECTIONS) {
  if (engines[section.engine] === undefined) {
    console.error(
      `eto.toml: section "${section.slug}" names engine "${section.engine}", ` +
        `but this press only knows: ${Object.keys(engines).join(", ")}`
    )
    process.exit(1)
  }
}

// The journal lives in db/ (gitignored); ensure the directory exists before
// the SQLite layer opens the file.
mkdirSync("db", { recursive: true })

const SqlLive = SqliteClient.layer({ filename: "db/eto.sqlite" })

// Ollama is the provider's transport, not an engine capability: it is
// provided TO the inference boundary and appears nowhere in the ceiling
// (engines.ts).
const OllamaLive = Ollama.Default.pipe(Layer.provide(NodeHttpClient.layer))

const MainLive = Layer.mergeAll(
  NodeContext.layer,
  NodeHttpClient.layer,
  SqlLive,
  Inference.Default.pipe(Layer.provide(OllamaLive)),
  Desk.Default.pipe(Layer.provide(NodeContext.layer))
)

NodeRuntime.runMain(pressRun(engines).pipe(Effect.provide(MainLive)))
