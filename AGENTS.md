# Repository Guidelines

## Project Overview

MyLibPro is a Next.js App Router application for managing a personal academic library. It uses React, TypeScript, Tailwind CSS 4, shadcn/Radix-style UI components, lucide-react icons, and a local SQLite database through `better-sqlite3`.

The AI research agent follows a **Skills-first, full-text-first** design: the agent must read complete Markdown evidence units before generating research conclusions. Search results, abstracts, and metadata are only for selecting documents, never for answering.

## Important Paths

- `app/`: Next.js routes, pages, layouts, and API route handlers.
- `app/api/agent/chat/route.ts`: Streaming chat endpoint with workflow state machine.
- `app/api/agent/sessions/route.ts`: Session create/delete endpoint.
- `components/`: Shared React components and UI primitives.
- `components/agent/`: AI assistant chat (`ChatInput`, `ChatMessage`) and workspace UI (`WorkspacePanel`).
- `lib/`: Server-side helpers.
  - `lib/db.ts`: SQLite access via `better-sqlite3`, WAL mode, auto-migration.
  - `lib/agent/tools/`: One file per tool declaration + executor; aggregated by `lib/agent/tools/index.ts` (`executeTool`, `allDeclarations`).
  - `lib/agent/workspace/`: In-memory session workspace (references, history, events, artifacts).
  - `lib/agent/skills.ts`: Skill loader — reads `skills/*/SKILL.md` and `schema.json`.
  - `lib/agent/system-prompt.ts`, `lib/agent/state-machine.ts`, `lib/agent/providers/`: prompt, workflow phases, and provider adapters (Gemini / OpenAI-compatible).
- `skills/`: Local Skill definitions. Each subdirectory is one Skill with `SKILL.md` + `schema.json`.
- `db/library.db`: Local SQLite database (WAL mode; `library.db-shm` and `library.db-wal` are runtime files).
- `scripts/`: Data import and cover generation scripts.
- `public/covers/`: Generated/static cover images.

## Commands

- `npm run dev`: Start the Next.js development server.
- `npm run build`: Build the production app.
- `npm run start`: Start the built app.
- `npm run lint`: Run ESLint.
- `npm run import`: Import metadata into SQLite with `scripts/import-books.ts`.
- `npm run covers`: Generate cover images with `scripts/generate-covers.ts`.
- `npm run prepare-data`: Run import and cover generation.

## Coding Conventions

- Use TypeScript and keep `strict` compatibility.
- Prefer the existing `@/*` import alias for project modules.
- Follow existing component patterns in `components/ui` and use lucide-react icons for UI actions.
- Keep client components marked with `"use client"` only where client state, effects, or browser APIs are needed.
- Keep server-only database work in API routes or server-side helpers under `lib/`.

## Agent Architecture

### Workflow State Machine (`app/api/agent/chat/route.ts`)

The agent loop enforces the research protocol through **code**, not prompt instructions. Tools available per phase:

```
INITIAL      → all tools
MUST_READ    → get_document_detail, load_full_text, load_chapter, remove_reference
MUST_RECORD  → record_reading
MUST_NOTES   → update_research_notes
MUST_DECIDE  → decide_continue_or_answer
CAN_DECIDE   → all tools
```

Phase transitions are driven by tool results (`phaseAfterTool`). The model cannot skip phases — if it tries to answer without completing the workflow, it receives a nudge and loops again.

### Tools (`lib/agent/tools/`)

| Tool | Category | Purpose |
|------|----------|---------|
| `search_library` | READ | Search catalog by query/type/discipline |
| `get_document_detail` | READ | Get metadata, TOC, chapter list |
| `load_full_text` | READ | Load complete Markdown for non-book documents; returns chapter list for books |
| `load_chapter` | READ | Load one chapter Markdown (minimum unit for books) |
| `record_reading` | WRITE | Record findings after reading; creates `reading_note` artifact |
| `update_research_notes` | WRITE | Update cross-document research notebook |
| `decide_continue_or_answer` | WRITE | Explicit decision gate before answering |
| `remove_reference` | WRITE | Release low-value full-text from active context |

Every successful tool call emits a `ResearchEvent` into the workspace.

### Workspace (`lib/agent/workspace/`)

In-memory, session-scoped. Exported types and functions:

- `WorkspaceState`: top-level session container.
- `ResearchSession`: session metadata and status.
- `ActiveReference`: currently loaded full-text units (documents or chapters), with `usefulness` and `reasonToKeep`.
- `ReadingHistoryEntry`: durable record of every completed reading.
- `ResearchEvent`: trace of every tool call.
- `ResearchArtifact`: reusable outputs (`reading_note`, `evidence_summary`, `citation_list`, `final_answer`).
- `CONTEXT_BUDGET`: `{ soft_limit: 100_000, hard_limit: 150_000 }` tokens.
- `checkContextBudget(ws)`: returns `"ok" | "warning" | "critical"`.
- `recordEvent`, `addArtifact`, `appendReadingHistory`, `updateResearchNotebook`: workspace mutation helpers.
- `getWorkspaceSummary(sessionId)`: human-readable workspace state injected into system prompt.
- `getWorkspaceSnapshot(sessionId)`: full snapshot sent to the client UI.

### Skills (`lib/agent/skills.ts` + `skills/`)

Skills define *how* to do research, not *what* tools exist. Each Skill lives in `skills/<name>/SKILL.md` with an optional `schema.json`. `getResearchSkillPrompt()` loads all skills and injects them into the system prompt at request time.

### LLM Providers

The agent supports two providers, resolved via `resolveAgentConfig`:

- **Gemini** (default): `GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-3.1-flash-lite-preview`). Uses `@google/genai` with `thinkingLevel: "high"`.
- **OpenAI-compatible**: `NEWAPI_API_KEY` / `OPENAI_API_KEY`, `NEWAPI_MODEL` / `OPENAI_MODEL`, `NEWAPI_BASE_URL` / `OPENAI_BASE_URL`. Optional prompt caching via `AGENT_CONTEXT_CACHE_ENABLED=true`.

Provider can be overridden per-request via `AGENT_PROVIDER` / `LLM_PROVIDER` env vars or the request body.

## Database Notes

- `lib/db.ts` creates and migrates the SQLite schema at runtime and enables WAL mode.
- Schema: `documents` table with `document_id`, `type` (book/paper), `title`, `authors`, `year`, `discipline`, `chapters` (JSON array of chapter filenames), `full_text_path`, `token_count`, etc.
- Full-text search via `documents_fts` (FTS5 virtual table).
- Avoid deleting or reverting `db/library.db`, `db/library.db-shm`, or `db/library.db-wal` unless explicitly requested.
- Use `DB_PATH` env var when a task needs an isolated database.
- Data files (Markdown full texts) are resolved from `DATA_ROOT` env var, defaulting to `../data` relative to the project root.

## Environment

- Copy `.env.example` to `.env.local` for local configuration.
- Key env vars: `GEMINI_API_KEY`, `GEMINI_MODEL`, `NEWAPI_API_KEY`, `NEWAPI_MODEL`, `NEWAPI_BASE_URL`, `AGENT_PROVIDER`, `DATA_ROOT`, `DB_PATH`, `AGENT_CONTEXT_CACHE_ENABLED`.
- Do not commit secrets from `.env.local`.

## Verification

- For general code changes, run `npm run lint` and `npm run build` when feasible.
- For frontend changes, inspect the affected page in a browser at the dev server URL.
- For API/database changes, test the relevant API route and consider using an isolated `DB_PATH`.

## Non-negotiable Research Invariants

When modifying agent code, verify these invariants are preserved:

1. Deep research must follow: `search → (books: get_document_detail → load_chapter; papers: load_full_text) → record_reading → update_research_notes → decide_continue_or_answer`.
2. For books, the minimum full-text unit is a chapter (`load_chapter`), not the whole book.
3. `record_reading` must bind a specific `document_id` (and `chapter_file_name` for chapters).
4. `update_research_notes` must be based on already-loaded full-text content.
5. Final answers must only cite documents present in reading history or active references.
6. `remove_reference` only releases context — it never deletes reading history, notebook, or artifacts.
7. `decide_continue_or_answer` cannot be called before at least one reading is recorded and notes are updated.

## Current Local Caveats

- The current worktree may already contain local modifications to SQLite WAL database files. Treat them as user/local runtime state unless the task explicitly asks to manage database artifacts.
- On this Windows environment, PowerShell profile loading may emit execution-policy warnings; use non-profile shell execution where possible.
- `rg` may be present but blocked by local permissions; fall back to PowerShell commands or `git ls-files` for repository discovery.
