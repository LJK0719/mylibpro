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
 * Normalize a `full_text_path` field that may have a `library/` prefix
 * left over from older import scripts.
 */
export function resolveFullTextPath(view: DocumentView): string {
    let ftPath = view.full_text_path;
    if (ftPath.startsWith("library/")) {
        ftPath = ftPath.replace(/^library\//, "");
    }
    return ftPath;
}

export function joinDataPath(...segments: string[]): string {
    return path.join(DATA_ROOT, ...segments);
}
