# research.update_notebook

## Purpose
Merge one document's reading findings into the cross-document research notebook.

## When To Use
Use immediately after record_reading and before deciding whether to answer or read more.

## Input Contract
```json
{
  "document_id": "string",
  "key_findings": "string",
  "relation_to_question": "string",
  "conflicts_or_limits": "string | optional"
}
```

## Output Contract
```json
{
  "notebook_update_mode": "append | replace",
  "updated_sections": ["string"],
  "open_questions": ["string"]
}
```

## Required Tools
- update_research_notes

## Must Not
- Do not write a flat summary only.
- Do not omit document_id references.
- Do not hide conflicts, limitations, or weak evidence.

## Failure Handling
If the finding is not useful, still record why it is weak and what evidence remains missing.

## Quality Checklist
- Notes connect evidence to the user question.
- Notes preserve source document IDs.
- Open questions are explicit.
