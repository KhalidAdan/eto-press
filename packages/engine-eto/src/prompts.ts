/**
 * The prompts moved behind the inference boundary: they are the Ollama
 * provider's question specs now, versioned and hashed where they are
 * answered (@eto-press/platform/inference-ollama). This module re-exports
 * them so the generation-2 public surface and the lab scripts keep
 * working; new code should import from the provider directly.
 */
export {
  COMPOSITE_PROMPT_HASH,
  COMPOSITE_TEMPLATE,
  compositePrompt,
  SAME_EVENT_PROMPT_HASH,
  SAME_EVENT_TEMPLATE,
  sameEventPrompt
} from "@eto-press/platform/inference-ollama"
export type {
  CompositeAccount as AccountForPrompt,
  PairItem as PromptItem
} from "@eto-press/platform/inference"
