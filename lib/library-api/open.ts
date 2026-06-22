/**
 * Return the body text of ONE node (just-in-time retrieval), bounded by a
 * token budget. Oversized nodes are truncated and the agent is handed the
 * child node ids so it can drill into the relevant branch instead.
 */

import { getDb, recordToView } from "../db";
import { getDocumentById } from "../repositories/documents";
import { readNodeText } from "./build-tree";
import type { DocNodeRow } from "./types";

const APPROX_CHARS_PER_TOKEN = 4;

export function openNode(input: {
    nodeId: string;
    maxTokens?: number;
}):
    | {
          node_id: string;
          document_id: string;
          title: string;
          heading_path: string;
          citation: string;
          token_count: number;
          truncated: boolean;
          child_node_ids: string[];
          text: string;
          is_container?: boolean;
          message?: string;
      }
    | { error: string } {
    const db = getDb();
    const row = db
        .prepare(`SELECT * FROM doc_nodes WHERE node_id = ?`)
        .get(input.nodeId) as DocNodeRow | undefined;
    if (!row) return { error: `Node not found: ${input.nodeId}` };

    const doc = getDocumentById(row.document_id);
    if (!doc) return { error: `Document not found: ${row.document_id}` };
    const view = recordToView(doc);

    const childRows = db
        .prepare(`SELECT node_id FROM doc_nodes WHERE parent_id = ? ORDER BY ordinal`)
        .all(input.nodeId) as { node_id: string }[];
    const childIds = childRows.map((c) => c.node_id);

    const citation = `${view.authors.join(", ") || "Unknown"}${view.year ? ` (${view.year})` : ""}. ${view.title}. ${row.heading_path}`;

    // Document root of a multi-file book has no own text.
    if (!row.chapter_file) {
        return {
            node_id: row.node_id,
            document_id: row.document_id,
            title: row.title,
            heading_path: row.heading_path,
            citation,
            token_count: 0,
            truncated: false,
            child_node_ids: childIds,
            text: "",
            is_container: true,
            message: "This is the document root. Call outline(document_id) to see chapters, then open a chapter/section node.",
        };
    }

    const full = readNodeText(row, { type: view.type, folder_name: view.folder_name });
    const maxChars = Math.min(40000, Math.max(400, (input.maxTokens ?? 1500) * APPROX_CHARS_PER_TOKEN));
    const truncated = full.length > maxChars;
    const text = truncated ? full.slice(0, maxChars).trimEnd() : full;

    return {
        node_id: row.node_id,
        document_id: row.document_id,
        title: row.title,
        heading_path: row.heading_path,
        citation,
        token_count: Math.ceil(text.length / APPROX_CHARS_PER_TOKEN),
        truncated,
        child_node_ids: childIds,
        text,
        ...(truncated
            ? { message: "Node truncated to the token budget. Open a child node (child_node_ids) to read a specific sub-section." }
            : {}),
    };
}
