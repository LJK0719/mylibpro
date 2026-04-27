# research.read_fulltext_and_note

## Purpose
Read one complete Markdown evidence unit and record findings relevant to the current research question. For papers this unit is the whole paper; for books/textbooks this unit is one chapter.

## When To Use
Use after candidate documents have been found and before any research conclusion is generated.

## Input Contract
```json
{
  "document_id": "string",
  "reading_purpose": "string",
  "focus_questions": ["string"]
}
```

## Output Contract
```json
{
  "document_id": "string",
  "read_status": "completed | partial_with_reason | failed",
  "key_findings": "string",
  "usefulness": "high | medium | low",
  "should_keep_active": true
}
```

## Required Tools
- load_full_text for non-book documents
- load_chapter for books/textbooks
- record_reading
- remove_reference when the document should not stay in active context

## Must Not
- Do not skip full text loading.
- Do not load a whole book/textbook through parsed/full_text.md.
- Do not record findings for a document that is not active.
- Do not treat a chapter as a snippet. A chapter is the minimum full-text unit for books and must be read as a complete Markdown file.
- Do not load or record an evidence unit that already appears in Reading History for the current session. Choose a different unread chapter/document or proceed to the decision step.

## Failure Handling
If a paper full text or a book chapter is unavailable, report the failure and choose another candidate or chapter. If context budget is critical, remove low-value active references before loading more.

## Quality Checklist
- A complete paper Markdown or complete book chapter Markdown was loaded.
- Findings are bound to the concrete document_id and, for books, chapter_file_name.
- The evidence unit was not already present in Reading History.
- Usefulness and reason to keep are decided.
- Reading history and a reading note artifact are created.
