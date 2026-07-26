export const OLLAMA_URL = "http://localhost:11434"

/** Matching is high-volume: a small model that just answers, no thinking. */
export const MATCH_MODEL = "qwen3:4b-instruct"

/** Compositing is low-volume — a handful of stories a day — and can afford
 * a larger model with a longer context. */
export const COMPOSITE_MODEL = "llama3.1:8b"
export const COMPOSITE_NUM_CTX = 8192
