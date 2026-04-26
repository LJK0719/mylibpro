# MyLibPro

English | [简体中文](./README.zh-CN.md)

MyLibPro is a local-first academic library app built with Next.js App Router, React, TypeScript, Tailwind CSS, and SQLite. It stores document metadata in SQLite, indexes it with FTS5, and can run an AI research assistant over local Markdown full text.

The project is designed for personal research workflows: browse a library, manage reading status and shelves, inspect document details, and ask the agent questions that must be grounded in loaded full-text evidence.

## Why This App Exists

Most library tools stop at cataloging PDFs. Most RAG demos stop at retrieving short chunks. MyLibPro sits in the middle: it keeps the original document collection organized, converts the parts needed for AI work into structured Markdown, and forces the research agent to read evidence units before it writes conclusions.

The important split is:

- PDF is the archival format. It preserves the source document, layout, pagination, figures, publisher formatting, and citation fidelity.
- Markdown is the working format. It is searchable, diffable, easy to inspect, and much easier for LLMs to read than raw PDF bytes or page images.

In practice, a useful AI-era academic library needs both. Keep the PDF as the source of record, and keep a Markdown version next to it for search, citation review, agent reading, note extraction, and downstream automation.

## Features

- Library browsing with search, discipline filters, reading status, favorites, and shelves.
- Document detail pages for books and papers.
- Local SQLite database via `better-sqlite3`, with automatic schema migration and WAL mode.
- Markdown-first data model for full-text research.
- AI assistant with a state-machine enforced reading workflow.
- Gemini and OpenAI-compatible provider support.
- Clear separation between source PDFs, parsed Markdown, metadata, and generated covers.

## AI Research Assistant

`Vectorless knowledge base` `Full-text-first research`

The research assistant is the main reason this project is more than a library UI. It is built for evidence-based academic work, not for quick answers over loose search results.

Instead of doing a generic "retrieve top-k chunks and answer" pass, the assistant works through a visible research loop:

```text
search catalog
  -> load full Markdown evidence
  -> record reading
  -> update research notes
  -> decide whether to read more or answer
```

That gives MyLibPro a few practical advantages:

- Search is only used to choose documents. It is not treated as evidence.
- Papers are read as complete Markdown documents.
- Books are read chapter by chapter, which keeps context manageable and avoids pretending that an entire textbook was read at once.
- Every loaded evidence unit has a reading record.
- Session notes accumulate across documents, so the answer is built from a research trail instead of a single prompt.
- The agent can release active full text from context while keeping reading history and notes intact.

This is intentionally more disciplined than a normal chatbot. The goal is not to make the model sound confident; the goal is to make it read the library before it writes.

The workflow is enforced in code by `lib/agent/state-machine.ts` and the chat route:

```text
initial
  -> must_read
  -> must_record
  -> must_notes
  -> must_decide
  -> can_decide
```

Tool availability changes by phase:

| Phase | Allowed tools |
| --- | --- |
| `initial` | all tools |
| `must_read` | `get_document_detail`, `load_full_text`, `load_chapter`, `remove_reference`, `decide_continue_or_answer` |
| `must_record` | `record_reading` |
| `must_notes` | `update_research_notes` |
| `must_decide` | `decide_continue_or_answer` |
| `can_decide` | all tools |

Important invariants:

- Deep research follows `search -> read full text -> record reading -> update notes -> decide`.
- Books are read by chapter through `load_chapter`; the whole book is not loaded as one evidence unit.
- `record_reading` must identify the document, and for books it must also identify the chapter file.
- Final answers should cite documents that were actually read or are still active in the workspace.
- `remove_reference` only releases active context. It does not delete reading history, notes, or artifacts.
- `decide_continue_or_answer` requires at least one reading record and updated notes.

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- shadcn/Radix-style UI primitives
- lucide-react icons
- SQLite FTS5 through `better-sqlite3`
- `@google/genai` plus an OpenAI-compatible provider adapter

## Getting Started

Requirements:

- Node.js 20+
- npm
- SQLite support through the bundled `better-sqlite3` native package
- An LLM API key if you want to use the research agent

Install dependencies:

```bash
npm install
```

Create local config:

```bash
cp .env.example .env.local
```

At minimum, set:

```bash
GEMINI_API_KEY=...
DATA_ROOT=D:/bookdata/libdata
DB_PATH=./db/library.db
```

Run the app:

```bash
npm run dev
```

Open:

- Library: `http://localhost:3000`
- Research agent: `http://localhost:3000/agent`

## Library Data Layout

The library is not imported from arbitrary folders. MyLibPro expects a specific directory layout under `DATA_ROOT`.

Current defaults:

- `DATA_ROOT` defaults to `D:\bookdata\libdata` when that path exists.
- Otherwise it falls back to `../data` relative to the project root.
- You can override it in `.env.local`.

Top-level layout:

```text
DATA_ROOT/
  book/
    <folder_name>/
      metadata.json
      source.pdf              # recommended: original PDF, kept for archive/review
      content.md              # optional: whole-book Markdown, not loaded by the agent as one unit
      chapters/
        01-introduction.md
        02-related-work.md
        ...
  paper/
    <folder_name>/
      metadata.json
      source.pdf              # recommended: original PDF
      content.md              # required for load_full_text unless full_text_path points elsewhere
  report/
    ...                       # not imported by the current script unless support is added
```

Only `book/` and `paper/` are scanned by the current importer. Additional types can be represented in metadata, but they need importer support before they are discovered automatically.

Book layout:

```text
DATA_ROOT/book/bishop-prml-2006/
  metadata.json
  source.pdf
  content.md
  chapters/
    00-preface.md
    01-introduction.md
    02-probability-distributions.md
```

For books, `chapters/*.md` is the important part for the agent. The importer records the sorted chapter file names into the `chapters` column, and `load_chapter` reads from:

```text
DATA_ROOT/<type>/<folder_name>/chapters/<chapter_file_name>
```

Paper layout:

```text
DATA_ROOT/paper/attention-is-all-you-need-2017/
  metadata.json
  source.pdf
  content.md
```

For papers and short documents, `load_full_text` reads the Markdown path resolved from metadata. In the common case:

```json
{
  "type": "paper",
  "folder_name": "attention-is-all-you-need-2017",
  "full_text_path": "paper/attention-is-all-you-need-2017/content.md"
}
```

Recommended local convention:

- Keep the original PDF as `source.pdf`.
- Keep parsed Markdown as `content.md` for papers.
- Split books into `chapters/*.md`; keep `content.md` only as a convenience copy if needed.
- Keep `metadata.json` beside the source files.
- Do not put runtime database files inside `DATA_ROOT`.

## PDF to Markdown

PDF conversion is outside the importer. The app expects Markdown to already exist before you run `npm run import`.

For technical PDFs with formulas, tables, code blocks, and multi-column layouts, use a parser that preserves document structure. The recommended platform for this project is [KolmoPDF](https://www.kolmopdf.com/), especially its member API for batch PDF-to-Markdown workflows.

Recommended ingestion flow:

```text
1. Save the original PDF under DATA_ROOT/book/... or DATA_ROOT/paper/...
2. Convert the PDF to Markdown with KolmoPDF or an equivalent parser.
3. For books, split the Markdown into chapter files under chapters/.
4. Create or update metadata.json.
5. Run npm run prepare-data.
6. Review the document in MyLibPro before relying on it in agent research.
```

Conversion quality matters because the agent reads Markdown as evidence. Broken headings, flattened tables, or corrupted formulas will directly reduce answer quality.

## Data Import

The database is populated from `metadata.json` and chapter files under `DATA_ROOT`.

Run:

```bash
npm run prepare-data
```

This runs:

```bash
npm run import
npm run covers
```

The importer writes metadata into `db/library.db`. Runtime SQLite files such as `library.db-wal` and `library.db-shm` are local state.

## Metadata Format

A typical `metadata.json`:

```json
{
  "document_id": "bishop-prml-2006",
  "type": "book",
  "title": "Pattern Recognition and Machine Learning",
  "authors": ["Christopher M. Bishop"],
  "year": 2006,
  "discipline": ["Machine Learning"],
  "subdiscipline": ["Probabilistic Models"],
  "keywords": ["Bayesian inference", "pattern recognition"],
  "abstract": "...",
  "toc": "...",
  "folder_name": "bishop-prml-2006",
  "full_text_path": "book/bishop-prml-2006/content.md",
  "chapters": ["01-introduction.md"],
  "token_count": 180000
}
```

The app also supports localized metadata fields such as `title_zh`, `title_en`, `authors_zh`, `authors_en`, `discipline_zh`, `discipline_en`, `abstract_zh`, and `abstract_en`.

## Commands

```bash
npm run dev          # Start the Next.js dev server
npm run build        # Build for production
npm run start        # Start the production server
npm run lint         # Run ESLint
npm run import       # Import metadata into SQLite
npm run covers       # Generate cover images
npm run prepare-data # Import data and generate covers
```

## Project Structure

```text
app/                         Next.js routes and API handlers
  api/agent/chat/route.ts     Streaming research-agent endpoint
  api/agent/sessions/route.ts Agent session create/delete endpoint
  api/books/                  Library API routes
  agent/                      Research-agent page
  books/                      Document detail pages

components/
  agent/                      Chat and workspace UI
  common/                     Navigation, language, theme providers
  library/                    Library and document components
  ui/                         Shared UI primitives

lib/
  db.ts                       SQLite setup and migrations
  repositories/               Data access helpers
  search/                     Search normalization helpers
  agent/                      Agent prompts, tools, state machine, providers

skills/                       Local research skill definitions
scripts/                      Import and cover generation scripts
public/covers/                Generated/static cover assets
db/                           Local SQLite database
```

## LLM Providers

Gemini is the default provider:

```bash
AGENT_PROVIDER=gemini
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.1-flash-lite-preview
```

OpenAI-compatible endpoints are also supported:

```bash
AGENT_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4.1-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

Local OpenAI-compatible servers such as Ollama or LM Studio can be used by changing `OPENAI_BASE_URL` and `OPENAI_MODEL`.

## Development Notes

- Keep database access in API routes or server-side helpers under `lib/`.
- Use the `@/*` import alias for project modules.
- Mark components with `"use client"` only when they need state, effects, or browser APIs.
- Keep UI changes consistent with existing components in `components/ui`.
- Do not commit `.env.local` or other secrets.
- Treat `db/library.db`, `db/library.db-wal`, and `db/library.db-shm` as local runtime data unless a task explicitly changes database assets.

## Verification

For code changes:

```bash
npm run lint
npm run build
```

For data or API work, prefer an isolated database:

```bash
DB_PATH=./db/test-library.db npm run import
```

For frontend changes, run the dev server and inspect the affected page in a browser.

## License

MIT
