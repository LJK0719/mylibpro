# MyLibPro as an External Brain — Usage Guide

Connect any AI agent to a curated academic library (textbooks & papers in
mathematics, statistics, machine learning, finance, …) and use it as an
**external brain**: search, navigate by structure, and pull exact source text
with citations — **token-efficiently**.

- **Base URL:** `https://lib.jk0719.online`
- **MCP endpoint:** `https://lib.jk0719.online/api/mcp` (Streamable HTTP)
- **REST base:** `https://lib.jk0719.online/api/v1`
- **Auth:** every request needs an API key (header or query — see below).

> **Why this isn't classic RAG.** There are **no vectors and no chunking**.
> Each document is parsed into its own **hierarchical tree** (chapter → section
> → subsection). You navigate the document's real logical structure and load
> only the nodes you need. This preserves disciplinary argument chains
> (definitions → theorems → proofs) that vector chunking destroys, and keeps
> token usage low.

---

## 1. Quick start

### Option A — Claude Code / Claude.ai (Skill + MCP, one line)
```bash
curl -fsSL https://lib.jk0719.online/install.sh | bash -s -- <YOUR_API_KEY>
```
Installs the `mylibpro` skill into `~/.claude/skills/` and registers the remote
MCP server. Then just ask a question in the library's fields — the AI consults
the library first.

### Option B — Any MCP client (Cursor, Windsurf, custom)
Add the remote MCP server:
```json
{
  "mcpServers": {
    "mylibpro": {
      "url": "https://lib.jk0719.online/api/mcp",
      "headers": { "X-API-Key": "<YOUR_API_KEY>" }
    }
  }
}
```
Claude Code CLI equivalent:
```bash
claude mcp add --transport http mylibpro https://lib.jk0719.online/api/mcp \
  --header "X-API-Key: <YOUR_API_KEY>"
```

### Option C — Plain HTTP (no MCP)
Call the REST API directly (see §4). Useful for non-MCP agents and scripts.

---

## 2. Authentication

Send your key any one of these ways:

| Method | Example |
| --- | --- |
| Header (preferred) | `X-API-Key: <key>` |
| Bearer | `Authorization: Bearer <key>` |
| Query param | `?key=<key>` |

The discovery manifest `GET /api/v1` is public (no key). Everything else is
read-only and rate-limited (60 req/min/key). `401` = missing/invalid key,
`429` = too fast, `503` = the server has no keys configured.

---

## 3. The 5 tools (MCP names ↔ REST routes)

| MCP tool | REST | Purpose |
| --- | --- | --- |
| `library_collections` | `GET /api/v1/collections` | List disciplines / shelves / types to scope by |
| `library_search` | `GET /api/v1/search` | Find documents (compact cards) |
| `library_outline` | `GET /api/v1/outline` | A document's tree — titles + summaries, **no body text** |
| `library_open` | `GET /api/v1/open` | Read **one** node's full text (bounded) |
| `library_locate` | `GET /api/v1/locate` | Find which nodes mention a keyword |

### Parameters

- **search** — `query` (string, English keywords), `limit` (1–20, default 8),
  and a **scope**: `type` (`book`|`paper`), `shelf`, `discipline`,
  `document_ids` (array). Returns cards: `document_id, title, authors, year,
  discipline, snippet, token_count, has_tree, citation`.
- **outline** — `document_id`, optional `node_id` (expand a sub-branch),
  `depth` (1–5, default 2). Returns nested `{ node_id, title, level,
  token_count, summary, child_count, children[] }`. **No body text.**
- **open** — `node_id`, optional `max_tokens` (100–8000, default 1500).
  Returns `{ title, heading_path, citation, token_count, truncated,
  child_node_ids[], text }`. If `truncated`, open a `child_node_ids` entry.
- **locate** — `document_id`, `keyword`, optional `limit`. Returns
  `matches[]: { node_id, heading_path, context }`.

---

## 4. Recommended workflow (multi-round, token-lean)

```
(optional) library_collections      → pick a scope
library_search(query, scope?)       → choose a document_id
library_outline(document_id)        → READ THE MAP; reason about which node
library_open(node_id)               → read just that section
   ↳ truncated? open a child_node_id
   ↳ need a term?  library_locate(document_id, keyword) → jump to its node
repeat (siblings / parents / new search) until you have enough
answer WITH citations (use the returned `citation` / `heading_path`)
```

Golden rules:
1. **Never dump whole books.** Outlines first; open the smallest node that
   answers the question; widen only on demand.
2. **Reason over structure.** The outline is a map of the argument — pick the
   branch whose title/summary matches, don't brute-force every node.
3. **Cite precisely.** Every `open`/`locate` result carries a `citation` and
   `heading_path` so claims map to an exact section.

### Worked example (REST)
```bash
KEY=<YOUR_API_KEY>; B=https://lib.jk0719.online/api/v1

# 1. find a document
curl -s "$B/search?q=reproducing+kernel+hilbert+space&limit=3" -H "X-API-Key: $KEY"
#   → cards; pick e.g. document_id = doc-2011-40f91c46  (has_tree:true)

# 2. get the map (no body text)
curl -s "$B/outline?document_id=doc-2011-40f91c46&depth=2" -H "X-API-Key: $KEY"
#   → choose a node_id, e.g. doc-2011-40f91c46.3.1

# 3. read just that node
curl -s "$B/open?node_id=doc-2011-40f91c46.3.1&max_tokens=1200" -H "X-API-Key: $KEY"

# jump to a term instead of scanning
curl -s "$B/locate?document_id=doc-2011-40f91c46&keyword=Mercer" -H "X-API-Key: $KEY"
```

---

## 5. Pre-selecting a scope

Focus retrieval before searching (great for "use this textbook" / "this field"):

- **A main reference book:** pass `document_ids=["doc-..."]` (or a comma list in
  REST) so search/outline stay within it.
- **A field's papers:** pass `discipline="statistics"` or a `shelf="..."`
  (see `library_collections` for available shelves & disciplines).
- **Books vs papers:** `type=book` / `type=paper`.

A skill (Option A) can store a default scope so the AI always starts there.

---

## 6. Notes

- **Read-only.** External callers can never modify the library.
- **`has_tree:false`** on a card means that document has no navigation tree yet;
  `library_open`/`library_outline` won't work for it (rare; rebuild pending).
- **node_id format** is `documentId.childOrdinal.childOrdinal…` (stable within a
  session; always take ids from a fresh `outline`/`search`).
- **Stateless.** No sessions or server-side memory — manage your own context.

Machine-readable manifest: `GET https://lib.jk0719.online/api/v1`.
