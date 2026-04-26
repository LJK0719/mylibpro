# research.decide_continue_or_answer

## Purpose
Decide whether to search more, read another evidence unit, or answer from already read evidence.

## When To Use
Use after at least one reading cycle has completed: load_full_text for a paper or load_chapter for a book, then record_reading and update_research_notes.

## Input Contract
```json
{
  "query": "string",
  "active_references": ["document_id"],
  "reading_history": ["document_id"],
  "research_notebook": "string"
}
```

## Output Contract
```json
{
  "decision": "search_more | read_more | answer",
  "reason": "string",
  "needed_document_type": "book | paper | any | optional",
  "missing_evidence": ["string"]
}
```

## Required Tools
- search_library when evidence is missing
- load_full_text when a specific unread paper is needed
- load_chapter when a specific unread book chapter is needed
- remove_reference when context budget is too high

## Must Not
- Do not choose answer if no complete evidence unit has been read.
- Do not answer if the notebook identifies unresolved essential evidence gaps.
- Do not cite unread documents.

## Failure Handling
If the library cannot support the question, answer with the evidence gap instead of inventing support.

## Quality Checklist
- Decision is justified by reading history and notebook state.
- Search-only paths are rejected.
- Active context is kept focused on useful papers and book chapters.
