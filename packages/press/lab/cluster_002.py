"""Experiment 002 — same-event clustering from raw RSS feeds.

Pipeline: fetch feeds listed in sources.toml -> normalize items ->
time-window filter -> lexical prefilter on cross-outlet pairs ->
local model answers "same event?" per pair -> union-find clusters.

Writeup lives in docs/experiments/. Run:  python lab/cluster_002.py
"""

import json
import re
import sys
import time
import tomllib
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

import feedparser

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "sources.toml"
OUT_DIR = ROOT / "lab" / "output"

USER_AGENT = "eto/0.1 experiment (local news compositor; front-door reader)"
WINDOW_HOURS = 48
OLLAMA_URL = "http://localhost:11434/api/chat"
MODEL = sys.argv[1] if len(sys.argv) > 1 else "qwen3:4b-instruct"

# Prefilter: a cross-outlet pair goes to the model only if the two items
# share >= 2 capitalized tokens, or 1 that is rare across the whole run.
CAP_TOKEN = re.compile(r"\b[A-Z][a-zA-Z]+\b")
CAP_STOPWORDS = {
    "The", "A", "An", "In", "On", "At", "To", "For", "Of", "And", "But",
    "Or", "As", "Is", "Are", "It", "Its", "He", "She", "They", "His",
    "Her", "Their", "This", "That", "These", "Those", "What", "Who",
    "How", "Why", "When", "Where", "With", "After", "Before", "Over",
    "Under", "Amid", "Says", "Say", "Said", "News", "Report", "Live",
    "Watch", "Video", "Opinion", "Exclusive", "Breaking", "Update",
}
RARE_FREQ = 4  # a token appearing in <= this many items counts as rare
TAG_RE = re.compile(r"<[^>]+>")


def fetch_feed(url: str) -> bytes | None:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.read()
    except Exception as e:
        print(f"    FAILED  {url}  ({e})")
        return None


def load_items() -> list[dict]:
    with open(SOURCES, "rb") as f:
        config = tomllib.load(f)

    cutoff = datetime.now(timezone.utc) - timedelta(hours=WINDOW_HOURS)
    items, seen_links = [], set()
    for source in config["source"]:
        print(f"  {source['name']}")
        for url in source["feeds"]:
            raw = fetch_feed(url)
            if raw is None:
                continue
            parsed = feedparser.parse(raw)
            kept = 0
            for entry in parsed.entries:
                ts = entry.get("published_parsed") or entry.get("updated_parsed")
                if ts is None:
                    continue
                published = datetime(*ts[:6], tzinfo=timezone.utc)
                link = entry.get("link", "")
                if published < cutoff or not link or link in seen_links:
                    continue
                seen_links.add(link)
                summary = TAG_RE.sub(" ", entry.get("summary", "") or "")
                items.append({
                    "id": len(items),
                    "outlet": source["name"],
                    "side": source["side"],
                    "title": (entry.get("title", "") or "").strip(),
                    "summary": " ".join(summary.split())[:500],
                    "link": link,
                    "published": published.isoformat(),
                })
                kept += 1
            print(f"    ok      {url}  ({kept} items in window)")
    return items


def cap_tokens(item: dict) -> set[str]:
    text = f"{item['title']} {item['summary']}"
    return {t for t in CAP_TOKEN.findall(text) if t not in CAP_STOPWORDS}


def candidate_pairs(items: list[dict]) -> list[tuple[int, int, set[str]]]:
    tokens = {it["id"]: cap_tokens(it) for it in items}
    freq: dict[str, int] = {}
    for toks in tokens.values():
        for t in toks:
            freq[t] = freq.get(t, 0) + 1

    pairs = []
    for i, a in enumerate(items):
        for b in items[i + 1:]:
            if a["outlet"] == b["outlet"]:
                continue
            shared = tokens[a["id"]] & tokens[b["id"]]
            if len(shared) >= 2 or any(freq[t] <= RARE_FREQ for t in shared):
                pairs.append((a["id"], b["id"], shared))
    return pairs


def ask_model(a: dict, b: dict) -> bool:
    # Wording matters enormously here: an earlier draft added a strict
    # "same time and place is required" clause and the model answered
    # "no" to everything, including known positives (see probe_prompts.py).
    prompt = (
        f"ITEM A ({a['outlet']}): {a['title']}\n{a['summary'][:250]}\n\n"
        f"ITEM B ({b['outlet']}): {b['title']}\n{b['summary'][:250]}\n\n"
        "Are these two items covering the same news event? Two items about "
        "the same person or topic but different happenings are different "
        "events. Answer with exactly one word: yes or no."
    )
    body = json.dumps({
        "model": MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "think": False,
        "options": {"temperature": 0},
    }).encode()
    req = urllib.request.Request(
        OLLAMA_URL, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=300) as resp:
        content = json.loads(resp.read())["message"]["content"]
    # Thinking models may prepend a reasoning transcript, sometimes with a
    # dangling </think> and no opening tag. The verdict is the last word.
    if "</think>" in content:
        content = content.rsplit("</think>", 1)[1]
    words = re.findall(r"[a-z]+", content.lower())
    verdict = words[-1] if words else ""
    if verdict not in ("yes", "no"):
        print(f"    unparseable verdict: {content[:80]!r} -> treating as no")
    return verdict == "yes"


class UnionFind:
    def __init__(self, n: int):
        self.parent = list(range(n))

    def find(self, x: int) -> int:
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a: int, b: int) -> None:
        self.parent[self.find(a)] = self.find(b)


def main() -> None:
    print("Fetching feeds...")
    items = load_items()
    print(f"\n{len(items)} items within {WINDOW_HOURS}h window")

    pairs = candidate_pairs(items)
    total_cross = sum(
        1 for i, a in enumerate(items) for b in items[i + 1:]
        if a["outlet"] != b["outlet"])
    print(f"{total_cross} cross-outlet pairs -> {len(pairs)} past prefilter\n")

    by_id = {it["id"]: it for it in items}
    uf = UnionFind(len(items))
    matches = []
    started = time.time()
    for n, (ai, bi, shared) in enumerate(pairs, 1):
        same = ask_model(by_id[ai], by_id[bi])
        if same:
            uf.union(ai, bi)
            matches.append([ai, bi])
        if n % 25 == 0 or n == len(pairs):
            rate = n / (time.time() - started)
            print(f"  {n}/{len(pairs)} pairs judged "
                  f"({len(matches)} matches, {rate:.1f} pairs/s)")

    clusters: dict[int, list[dict]] = {}
    for it in items:
        clusters.setdefault(uf.find(it["id"]), []).append(it)
    multi = sorted(
        (c for c in clusters.values() if len({i['outlet'] for i in c}) >= 2),
        key=lambda c: -len({i['outlet'] for i in c}))

    print(f"\n=== {len(multi)} multi-outlet clusters ===\n")
    for c in multi:
        sides = sorted({i["side"] for i in c})
        print(f"--- {len(c)} items, sides: {'/'.join(sides)}")
        for it in sorted(c, key=lambda i: i["outlet"]):
            print(f"  [{it['outlet']}] {it['title']}")
        print()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M")
    out = OUT_DIR / f"run-{stamp}.json"
    out.write_text(json.dumps({
        "model": MODEL, "window_hours": WINDOW_HOURS,
        "items": items, "judged_pairs": len(pairs), "matches": matches,
        "clusters": [[i["id"] for i in c] for c in multi],
    }, indent=2), encoding="utf-8")
    print(f"Full run saved to {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
