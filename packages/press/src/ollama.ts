/**
 * The Ollama client as an Effect service. Everything the pipeline asks a
 * local model goes through here, so tests can swap the whole thing out with
 * a fake Layer and prompt probes can run without a GPU.
 */
import { HttpClient, HttpClientRequest } from "@effect/platform"
import { Effect } from "effect"
import { OLLAMA_URL } from "./config.js"
import { OllamaCallFailed, OllamaDown } from "./errors.js"

interface ChatResponse {
  readonly message: { readonly content: string }
  readonly eval_count?: number
}

interface TagsResponse {
  readonly models: ReadonlyArray<{ readonly name: string; readonly digest: string }>
}

export class Ollama extends Effect.Service<Ollama>()("Ollama", {
  effect: Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient

    /** One prompt in, the raw completion text out. Temperature 0.
     *
     * `think: false` pins a hybrid-thinking model (qwen3:8b) to the mode it
     * was auditioned in — the 2026-08-01 edition lost four stories to
     * paraphrased "quotes" because production ran the compositor thinking
     * while the audition had it off. Models without a thinking mode reject
     * the parameter, so a 400 retries once without it. */
    const chat = (
      model: string,
      prompt: string,
      unit: string,
      opts?: { readonly numCtx?: number; readonly think?: boolean }
    ) =>
      Effect.gen(function* () {
        const ask = (withThink: boolean) =>
          http.execute(
            HttpClientRequest.post(`${OLLAMA_URL}/api/chat`).pipe(
              HttpClientRequest.bodyUnsafeJson({
                model,
                messages: [{ role: "user", content: prompt }],
                stream: false,
                ...(withThink && opts?.think !== undefined ? { think: opts.think } : {}),
                options: {
                  temperature: 0,
                  ...(opts?.numCtx ? { num_ctx: opts.numCtx } : {})
                }
              })
            )
          ).pipe(
            Effect.timeout("5 minutes"),
            Effect.mapError((cause) => new OllamaCallFailed({ unit, cause }))
          )

        let response = yield* ask(true)
        if (response.status === 400 && opts?.think !== undefined) {
          response = yield* ask(false)
        }
        if (response.status !== 200) {
          return yield* new OllamaCallFailed({
            unit,
            cause: `HTTP ${response.status}`
          })
        }
        const body = (yield* response.json.pipe(
          Effect.mapError((cause) => new OllamaCallFailed({ unit, cause }))
        )) as ChatResponse
        return body.message.content
      }).pipe(
        Effect.scoped,
        Effect.withSpan("ollama.chat", { attributes: { model, unit } })
      )

    /** Installed model names, for stage-0 preflight. */
    const installedModels = Effect.gen(function* () {
      const response = yield* http.execute(
        HttpClientRequest.get(`${OLLAMA_URL}/api/tags`)
      ).pipe(
        Effect.timeout("10 seconds"),
        Effect.mapError((cause) => new OllamaDown({ url: OLLAMA_URL, cause }))
      )
      if (response.status !== 200) {
        return yield* new OllamaDown({
          url: OLLAMA_URL,
          cause: `HTTP ${response.status}`
        })
      }
      const body = (yield* response.json.pipe(
        Effect.mapError((cause) => new OllamaDown({ url: OLLAMA_URL, cause }))
      )) as TagsResponse
      return body.models.map((m) => ({ name: m.name, digest: m.digest }))
    }).pipe(Effect.scoped, Effect.withSpan("ollama.installedModels"))

    return { chat, installedModels } as const
  })
}) {}
