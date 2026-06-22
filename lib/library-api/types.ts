/**
 * Shared types for the external library-api layer (REST + MCP).
 *
 * This layer is stateless and token-lean: it exposes the library as a
 * hierarchical, navigable knowledge base (vectorless / PageIndex-style) so
 * external agents can do reasoning-based, multi-round retrieval without the
 * frontend's workspace/session machinery.
 */

/** A node in a document's chapter→section→subsection tree. */
export interface DocNodeRow {
    node_id: string;
    document_id: string;
    parent_id: string | null;
    level: number;
    ordinal: number;
    title: string;
    chapter_file: string;
    char_start: number;
    char_end: number;
    token_count: number;
    summary: string;
    heading_path: string;
}

/** Scope filter shared by search / outline / locate. */
export interface LibraryScope {
    shelf?: string;
    discipline?: string;
    type?: "book" | "paper";
    document_ids?: string[];
}

/** A compact catalog card returned by `search`. */
export interface DocCard {
    document_id: string;
    type: string;
    title: string;
    authors: string[];
    year: number;
    discipline: string[];
    snippet: string;
    token_count: number;
    has_tree: boolean;
    citation: string;
}

/** A node as exposed to agents in `outline` (no body text). */
export interface OutlineNode {
    node_id: string;
    title: string;
    level: number;
    token_count: number;
    summary: string;
    child_count: number;
    children?: OutlineNode[];
}
