export const OLLAMA_URL = "http://localhost:11434"

/** The newsstand's public address. */
export const SITE_URL = "https://eto.news"

/** Matching is high-volume: a small model that just answers, no thinking. */
export const MATCH_MODEL = "qwen3:4b-instruct"

/** Compositing is low-volume — a handful of stories a day — and can afford
 * a larger model with a longer context. qwen3:8b won the 2026-07-31
 * audition (lab/composite-eval.ts): zero fabricated quotes across nine
 * stories, and the only candidate that refused to mash incoherent inputs
 * into one story. llama3.1:8b retired after the fabricated-BBC incident. */
export const COMPOSITE_MODEL = "qwen3:8b"
export const COMPOSITE_NUM_CTX = 8192
