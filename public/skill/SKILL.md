---
name: mylibpro-library
description: Search the user's curated academic library (textbooks & papers in mathematics, statistics, machine learning, finance and related fields) for grounded, citable evidence. Use BEFORE answering any question where the user's own library likely contains authoritative, discipline-level knowledge — definitions, theorems, derivations, methods. Provides hierarchical, token-efficient navigation via the `mylibpro` MCP tools.
license: MIT
---

# MyLibPro — the user's library as an external brain

This skill connects to the user's personal academic library through the
`mylibpro` MCP server (`__ENDPOINT__`). The library holds full-text books and
papers, each pre-parsed into a **hierarchical outline tree** (chapter → section
→ subsection). Retrieval is **structure-based, not vector-based**: you navigate
the document's own logical skeleton, so the disciplinary argument chain stays
intact and you only ever load the sections you actually need.

## When to use
Before answering a question in the user's fields (math, statistics, ML,
finance, …), check the library first — its textbooks/papers are authoritative,
real disciplinary knowledge, not shallow web facts. Prefer it over guessing.

## Tools (from the `mylibpro` MCP server)
- `library_search(query, scope?, type?, limit?)` — find documents (compact cards).
- `library_outline(document_id, node_id?, depth?)` — the **map**: titles + summaries, no body text.
- `library_open(node_id, max_tokens?)` — read **one** node's full text (just-in-time).
- `library_locate(document_id, keyword)` — jump to the nodes mentioning a term.
- `library_collections()` — disciplines / shelves / types, for scoping.

## Recommended workflow (multi-round, token-lean)
1. **Scope (optional).** If the user pinned a main textbook or a field, call
   `library_collections` and pass `scope` (a `shelf`, `discipline`, or explicit
   `document_ids`) to focus the search.
2. **Search.** `library_search` → pick the most relevant document(s).
3. **Map, don't dump.** `library_outline` on a document → reason over the tree
   to choose the right chapter/section. Expand a branch with `node_id`/`depth`
   only when needed.
4. **Open just the branch.** `library_open` on the chosen node. If it returns
   `truncated:true`, open one of its `child_node_ids` instead of asking for more.
   Use `library_locate` to jump straight to a term.
5. **Iterate.** Open sibling/parent nodes or search again to fill gaps. Stop as
   soon as you have enough evidence.
6. **Answer with citations.** Use the `citation` / `heading_path` returned by
   the tools so claims are attributable to the exact section.

## Token discipline
Never load whole books. Read outlines first; open the smallest node that
answers the question; widen only on demand. This keeps context small while
preserving full-fidelity, structured source material.
