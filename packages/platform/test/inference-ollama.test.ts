/**
 * The Ollama provider, exercised through the boundary with a fake Ollama
 * service — the typed answers, not the prompt text, are the contract.
 * Parser edge cases stay covered where they always were (the engine-eto
 * tests, through the compatibility re-exports).
 */
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { COMPOSITE_MODEL, MATCH_MODEL } from "../src/config.js"
import {
  makeOllamaProvider,
  COMPOSITE_PROMPT_HASH,
  SAME_EVENT_PROMPT_HASH
} from "../src/inference-ollama.js"
import { Ollama } from "../src/ollama.js"

const fakeOllama = (opts: {
  readonly reply?: (model: string, prompt: string) => string
  readonly installed?: ReadonlyArray<{ name: string; digest: string }>
}): Ollama =>
  ({
    chat: (model: string, prompt: string) =>
      Effect.succeed(opts.reply?.(model, prompt) ?? ""),
    installedModels: Effect.succeed(
      opts.installed ?? [
        { name: MATCH_MODEL, digest: "sha256:aaa" },
        { name: COMPOSITE_MODEL, digest: "sha256:bbb" }
      ]
    )
  }) as unknown as Ollama

const withProvider = <A>(
  fake: Ollama,
  use: (api: Effect.Effect.Success<typeof makeOllamaProvider>) => Effect.Effect<A, unknown, never>
): A =>
  Effect.runSync(
    makeOllamaProvider.pipe(
      Effect.flatMap(use),
      Effect.provideService(Ollama, fake)
    ) as Effect.Effect<A, never, never>
  )

const pair = { outlet: "AP", title: "t", summary: "s" }

describe("identities", () => {
  it("carry the configured models and 16-char question hashes", () => {
    const api = withProvider(fakeOllama({}), (api) => Effect.succeed(api))
    expect(api.provider).toBe("ollama")
    expect(api.identities.sameEvent).toEqual({
      model: MATCH_MODEL,
      questionHash: SAME_EVENT_PROMPT_HASH
    })
    expect(api.identities.composite).toEqual({
      model: COMPOSITE_MODEL,
      questionHash: COMPOSITE_PROMPT_HASH
    })
    expect(SAME_EVENT_PROMPT_HASH).toMatch(/^[0-9a-f]{16}$/)
    expect(COMPOSITE_PROMPT_HASH).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe("sameEvent", () => {
  it("returns a typed answer with an honest null confidence", () => {
    const v = withProvider(fakeOllama({ reply: () => "Sure.\nyes" }), (api) =>
      api.sameEvent(pair, pair, "pair 1-2")
    )
    expect(v).toEqual({ answer: "yes", confidence: null, raw: "Sure.\nyes" })
  })

  it("returns null for a completion with no verdict in it", () => {
    const v = withProvider(fakeOllama({ reply: () => "maybe?" }), (api) =>
      api.sameEvent(pair, pair, "pair 1-2")
    )
    expect(v.answer).toBeNull()
  })

  it("asks the match model", () => {
    let asked = ""
    withProvider(
      fakeOllama({ reply: (model) => ((asked = model), "no") }),
      (api) => api.sameEvent(pair, pair, "pair 1-2")
    )
    expect(asked).toBe(MATCH_MODEL)
  })
})

describe("nominate", () => {
  const deck = [
    { id: "c1", line: "c1 [left/right] (3 outlets): a | b" },
    { id: "c2", line: "c2 [left/center] (2 outlets): c | d" }
  ]

  it("returns the pick with the raw completion alongside", () => {
    const out = withProvider(
      fakeOllama({ reply: () => "c2 — A ruling changes ballot access in 23 states." }),
      (api) => api.nominate(deck, "below-the-fold nomination")
    )
    expect(out.pick).toEqual({
      id: "c2",
      reason: "A ruling changes ballot access in 23 states."
    })
  })

  it("returns a null pick but keeps the raw text for the stage's log", () => {
    const out = withProvider(
      fakeOllama({ reply: () => "The wildfire story deserves attention." }),
      (api) => api.nominate(deck, "below-the-fold nomination")
    )
    expect(out.pick).toBeNull()
    expect(out.raw).toContain("wildfire")
  })

  it("shows every candidate line to the model", () => {
    let prompt = ""
    withProvider(
      fakeOllama({ reply: (_m, p) => ((prompt = p), "c1 — Enough words to be a reason here.") }),
      (api) => api.nominate(deck, "below-the-fold nomination")
    )
    for (const c of deck) expect(prompt).toContain(c.line)
  })
})

describe("composite", () => {
  const accounts = [{ outlet: "AP", title: "t", text: "body text" }]
  const shaped =
    "HEADLINE: A thing happened\n\nBODY:\nIt did.\n\nWHERE THE ACCOUNTS DIFFER:\nNowhere.\n\nSOURCES: AP"

  it("returns the parsed four-part draft stamped with the attempt", () => {
    const draft = withProvider(fakeOllama({ reply: () => shaped }), (api) =>
      api.composite(accounts, { attempt: 3, revisionNotes: undefined, unit: "composite x" })
    )
    expect(draft?.headline).toBe("A thing happened")
    expect(draft?.attempt).toBe(3)
  })

  it("returns null for a shapeless completion", () => {
    const draft = withProvider(fakeOllama({ reply: () => "once upon a time" }), (api) =>
      api.composite(accounts, { attempt: 0, revisionNotes: undefined, unit: "composite x" })
    )
    expect(draft).toBeNull()
  })

  it("appends the editor's notes only on a revision pass", () => {
    let prompt = ""
    const grab = fakeOllama({ reply: (_m, p) => ((prompt = p), shaped) })
    withProvider(grab, (api) =>
      api.composite(accounts, { attempt: 0, revisionNotes: undefined, unit: "composite x" })
    )
    expect(prompt).not.toContain("EDITOR'S NOTES")
    withProvider(grab, (api) =>
      api.composite(accounts, { attempt: 1, revisionNotes: "fix the quote", unit: "composite x" })
    )
    expect(prompt).toContain("EDITOR'S NOTES")
    expect(prompt).toContain("fix the quote")
  })
})

describe("pin", () => {
  it("returns a digest for every configured model", () => {
    const pinned = withProvider(fakeOllama({}), (api) => api.pin())
    expect(pinned).toEqual([
      { model: MATCH_MODEL, digest: "sha256:aaa" },
      { model: COMPOSITE_MODEL, digest: "sha256:bbb" }
    ])
  })

  it("fails ModelMissing when a configured model is not installed", () => {
    const result = withProvider(
      fakeOllama({ installed: [{ name: MATCH_MODEL, digest: "sha256:aaa" }] }),
      (api) => api.pin().pipe(Effect.flip)
    )
    expect(result).toMatchObject({ _tag: "ModelMissing", model: COMPOSITE_MODEL })
  })
})
