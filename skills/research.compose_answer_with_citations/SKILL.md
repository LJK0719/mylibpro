# research.compose_answer_with_citations

## Purpose
Compose the final answer from read full texts and the research notebook.

## When To Use
Use only after the workflow has read full Markdown, recorded reading findings, and updated the notebook.

## Input Contract
```json
{
  "query": "string",
  "active_references": ["document_id"],
  "research_notebook": "string",
  "citation_style": "default | apa | chicago"
}
```

## Output Contract
```json
{
  "answer_markdown": "string",
  "cited_documents": ["document_id"],
  "confidence": "high | medium | low",
  "limitations": ["string"]
}
```

## Required Tools
- Workspace snapshot

## Must Not
- Do not cite unread documents.
- Do not hide uncertainty.
- Do not collapse source evidence and agent synthesis into one undifferentiated claim.

## Failure Handling
If evidence is insufficient, answer with the limitation and recommend the next reading step.

## Quality Checklist
- All citations come from reading history or active full-text references.
- Answer separates source claims, synthesis, and limitations.
- Final answer artifact is saved by the runtime.
