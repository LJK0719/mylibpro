/**
 * Shared imports and helpers used by individual tool modules.
 *
 * Each `lib/agent/tools/<name>.ts` module exports:
 *   - `<name>Declaration` — the function declaration object.
 *   - `execute<Name>` — the executor.
 *
 * Cross-cutting concerns (data root, file I/O, db access, workspace
 * mutation) live here so the per-tool files stay focused.
 */

import path from "path";
import { getDataRoot } from "../../config";
import type { DocumentView } from "../../db";

export const DATA_ROOT = getDataRoot();

/**
 * Resolve a document's `full_text_path` (relative to DATA_ROOT).
 * Paths are canonical (`<type>/<folder>/parsed/full_text.md`); the legacy
 * `library/` prefix is still tolerated for forward-compat with old DBs.
 */
export function resolveFullTextPath(view: DocumentView): string {
    return (view.full_text_path || "").replace(/^library\//, "");
}

export function joinDataPath(...segments: string[]): string {
    return path.join(DATA_ROOT, ...segments);
}
