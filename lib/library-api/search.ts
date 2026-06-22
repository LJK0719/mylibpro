/**
 * Stateless catalog search for the external library-api.
 *
 * Lexical BM25 over the existing FTS5 index (no vectors) + structured scope
 * filters. Returns compact cards only — agents then call `outline` to see a
 * document's tree. Reuses the same query helpers as the internal search tool.
 */

import { getDb, recordToView, type DocumentRecord } from "../db";
import { buildSearchQuery } from "../search/cjk";
import { disciplineSearchTerms } from "../search/disciplines";
import type { DocCard, LibraryScope } from "./types";

function citationFor(view: ReturnType<typeof recordToView>): string {
    const authors = view.authors.length ? view.authors.join(", ") : "Unknown";
    const year = view.year ? ` (${view.year})` : "";
    return `${authors}${year}. ${view.title}.`;
}

function snippetFor(view: ReturnType<typeof recordToView>): string {
    const text = view.metadata_i18n.abstract.en || view.abstract || view.metadata_i18n.abstract.zh || "";
    return text.length > 200 ? text.slice(0, 200).trimEnd() + "…" : text;
}

/** Build the WHERE fragments + params for a scope filter (alias `d`). */
function scopeClauses(scope: LibraryScope | undefined, params: Record<string, unknown>): string[] {
    const clauses: string[] = [];
    if (!scope) return clauses;

    if (scope.type) {
        clauses.push(`d.type = @scopeType`);
        params.scopeType = scope.type;
    }
    if (scope.shelf) {
        clauses.push(`d.shelves LIKE @scopeShelf`);
        params.scopeShelf = `%"${scope.shelf}"%`;
    }
    if (scope.discipline) {
        const terms = disciplineSearchTerms(scope.discipline).map((term, i) => {
            const key = `scopeDisc${i}`;
            params[key] = `%${term}%`;
            return `(d.discipline LIKE @${key} OR d.discipline_en LIKE @${key} OR d.discipline_zh LIKE @${key})`;
        });
        if (terms.length) clauses.push(`(${terms.join(" OR ")})`);
    }
    if (scope.document_ids && scope.document_ids.length) {
        const placeholders = scope.document_ids.map((id, i) => {
            const key = `scopeId${i}`;
            params[key] = id;
            return `@${key}`;
        });
        clauses.push(`d.document_id IN (${placeholders.join(", ")})`);
    }
    return clauses;
}

export function searchLibrary(input: {
    query: string;
    scope?: LibraryScope;
    type?: "book" | "paper";
    limit?: number;
}): { total: number; documents: DocCard[] } {
    const db = getDb();
    const limit = Math.min(20, Math.max(1, input.limit ?? 8));
    const params: Record<string, unknown> = { limit };

    const scope: LibraryScope = { ...input.scope };
    if (input.type) scope.type = input.type;

    const filters = scopeClauses(scope, params);
    const query = (input.query || "").trim();

    let sql: string;
    if (query) {
        const escaped = buildSearchQuery(query);
        if (!escaped) return { total: 0, documents: [] };
        params.q = escaped;
        const filterClause = filters.length ? `AND ${filters.join(" AND ")}` : "";
        sql = `SELECT d.* FROM documents_fts fts
               JOIN documents d ON d.document_id = fts.document_id
               WHERE fts.documents_fts MATCH @q ${filterClause}
               ORDER BY fts.rank LIMIT @limit`;
    } else {
        const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
        sql = `SELECT d.* FROM documents d ${whereClause} ORDER BY d.year DESC LIMIT @limit`;
    }

    const rows = db.prepare(sql).all(params) as DocumentRecord[];

    // Which of these have a navigation tree built?
    const ids = rows.map((r) => r.document_id);
    const treeSet = new Set<string>();
    if (ids.length) {
        const placeholders = ids.map(() => "?").join(", ");
        const treeRows = db
            .prepare(`SELECT DISTINCT document_id FROM doc_nodes WHERE document_id IN (${placeholders})`)
            .all(...ids) as { document_id: string }[];
        for (const t of treeRows) treeSet.add(t.document_id);
    }

    const documents: DocCard[] = rows.map((r) => {
        const view = recordToView(r);
        return {
            document_id: view.document_id,
            type: view.type,
            title: view.title,
            authors: view.authors,
            year: view.year,
            discipline: view.metadata_i18n.discipline.en.length ? view.metadata_i18n.discipline.en : view.discipline,
            snippet: snippetFor(view),
            token_count: view.token_count,
            has_tree: treeSet.has(view.document_id),
            citation: citationFor(view),
        };
    });

    return { total: documents.length, documents };
}
