/**
 * Return a document's hierarchical outline (the "map") — titles + summaries,
 * NO body text. Agents reason over this to decide which node to `open`.
 */

import { getDb } from "../db";
import { getDocumentById } from "../repositories/documents";
import type { DocNodeRow, OutlineNode } from "./types";

export function getOutline(input: {
    documentId: string;
    nodeId?: string;
    depth?: number;
}): { document_id: string; title: string; root: string; outline: OutlineNode } | { error: string } {
    const db = getDb();
    const doc = getDocumentById(input.documentId);
    if (!doc) return { error: `Document not found: ${input.documentId}` };

    const rows = db
        .prepare(`SELECT * FROM doc_nodes WHERE document_id = ? ORDER BY rowid`)
        .all(input.documentId) as DocNodeRow[];
    if (rows.length === 0) {
        return { error: `No navigation tree for ${input.documentId}. Run the index builder first.` };
    }

    const byId = new Map<string, DocNodeRow>();
    const children = new Map<string, DocNodeRow[]>();
    for (const r of rows) {
        byId.set(r.node_id, r);
        if (r.parent_id) {
            const list = children.get(r.parent_id) || [];
            list.push(r);
            children.set(r.parent_id, list);
        }
    }

    const startId = input.nodeId || input.documentId;
    const start = byId.get(startId);
    if (!start) return { error: `Node not found: ${startId}` };

    const maxDepth = Math.min(5, Math.max(1, input.depth ?? 2));

    const build = (row: DocNodeRow, remaining: number): OutlineNode => {
        const kids = children.get(row.node_id) || [];
        const node: OutlineNode = {
            node_id: row.node_id,
            title: row.title,
            level: row.level,
            token_count: row.token_count,
            summary: row.summary,
            child_count: kids.length,
        };
        if (remaining > 0 && kids.length) {
            node.children = kids.map((k) => build(k, remaining - 1));
        }
        return node;
    };

    return {
        document_id: input.documentId,
        title: doc.title,
        root: startId,
        outline: build(start, maxDepth),
    };
}
