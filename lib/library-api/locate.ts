/**
 * Keyword-locate inside a document: find which tree nodes mention a term.
 *
 * Reads each chapter file once, finds keyword offsets, and maps each hit to
 * the deepest node whose char range contains it. Returns node ids + a short
 * context line so the agent can jump straight to the right branch.
 */

import fs from "fs";
import { getDb, recordToView } from "../db";
import { getDocumentById } from "../repositories/documents";
import { joinDataPath } from "../agent/tools/_shared";
import type { DocNodeRow } from "./types";

export function locateInDocument(input: {
    documentId: string;
    keyword: string;
    limit?: number;
}): { document_id: string; keyword: string; matches: Array<{ node_id: string; heading_path: string; context: string }> } | { error: string } {
    const keyword = (input.keyword || "").trim();
    if (!keyword) return { error: "keyword is required" };

    const db = getDb();
    const doc = getDocumentById(input.documentId);
    if (!doc) return { error: `Document not found: ${input.documentId}` };
    const view = recordToView(doc);

    const rows = db
        .prepare(`SELECT * FROM doc_nodes WHERE document_id = ? AND chapter_file != '' ORDER BY rowid`)
        .all(input.documentId) as DocNodeRow[];
    if (rows.length === 0) return { error: `No navigation tree for ${input.documentId}.` };

    const limit = Math.min(20, Math.max(1, input.limit ?? 8));
    const needle = keyword.toLowerCase();

    // Group nodes by chapter file; read each file once.
    const byFile = new Map<string, DocNodeRow[]>();
    for (const r of rows) {
        const list = byFile.get(r.chapter_file) || [];
        list.push(r);
        byFile.set(r.chapter_file, list);
    }

    const matches: Array<{ node_id: string; heading_path: string; context: string }> = [];
    const seen = new Set<string>();

    for (const [chapterFile, fileNodes] of byFile) {
        if (matches.length >= limit) break;
        const abs = chapterFile.includes("/") || chapterFile.includes("\\")
            ? joinDataPath(chapterFile)
            : joinDataPath(view.type, view.folder_name, "chapters", chapterFile);
        if (!fs.existsSync(abs)) continue;
        const text = fs.readFileSync(abs, "utf-8");
        const hay = text.toLowerCase();

        let from = 0;
        while (matches.length < limit) {
            const idx = hay.indexOf(needle, from);
            if (idx === -1) break;
            from = idx + needle.length;

            // Deepest node containing this offset (highest level / smallest range).
            let best: DocNodeRow | null = null;
            for (const n of fileNodes) {
                if (idx >= n.char_start && idx < n.char_end) {
                    if (!best || n.level > best.level) best = n;
                }
            }
            if (!best || seen.has(best.node_id)) continue;
            seen.add(best.node_id);

            const ctxStart = Math.max(0, idx - 50);
            const ctxEnd = Math.min(text.length, idx + needle.length + 60);
            const context = text.slice(ctxStart, ctxEnd).replace(/\s+/g, " ").trim();
            matches.push({ node_id: best.node_id, heading_path: best.heading_path, context: `…${context}…` });
        }
    }

    return { document_id: input.documentId, keyword, matches };
}
