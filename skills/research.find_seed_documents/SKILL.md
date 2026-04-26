# research.find_seed_documents

## Purpose
Find candidate documents and, for books/textbooks, identify candidate chapters worth full Markdown reading for the user's research question.

## When To Use
Use at the start of a research task, or when the notebook shows missing evidence.

## Input Contract
```json
{
  "query": "string",
  "preferred_types": ["book", "paper"],
  "discipline": "string | optional",
  "max_candidates": 10
}
```

## Output Contract
```json
{
  "candidate_documents": [
    {
      "document_id": "string",
      "title": "string",
      "reason_to_read": "string",
      "priority": "high | medium | low"
    }
  ],
  "next_action": "load_fulltext | refine_search | ask_user"
}
```

## Required Tools
- search_library
- get_document_detail

## Must Not
- Do not answer from search results.
- Do not treat metadata, abstracts, or snippets as evidence for deep conclusions.
- Do not select candidates without a reason to read the full Markdown.

## Failure Handling
If search returns no useful candidates, refine the query once. If results are still weak, tell the user the local library may not contain enough evidence.

## Quality Checklist
- Candidate list is tied to the user question.
- At least one high-priority document is selected when results allow it.
- The next action is paper full-text loading or book chapter loading, not answering.
