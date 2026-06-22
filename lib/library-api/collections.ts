/**
 * Scope discovery: the disciplines, bookshelves and types an agent can use to
 * pre-select a working set (e.g. pin a main textbook, or a field's papers).
 */

import { getDb } from "../db";
import { getDisciplineFilters } from "../repositories/documents";
import { listShelves } from "../repositories/shelves";

export function getCollections(): {
    total_documents: number;
    documents_with_tree: number;
    types: string[];
    disciplines: Array<{ value: string; label: { en: string; zh: string } }>;
    shelves: Array<{ name: string; description: string; count: number }>;
} {
    const db = getDb();
    const filters = getDisciplineFilters();

    const total = (db.prepare(`SELECT COUNT(*) c FROM documents`).get() as { c: number }).c;
    const withTree = (
        db.prepare(`SELECT COUNT(DISTINCT document_id) c FROM doc_nodes`).get() as { c: number }
    ).c;

    const shelves = listShelves().map((s) => {
        const count = (
            db
                .prepare(`SELECT COUNT(*) c FROM documents WHERE shelves LIKE ?`)
                .get(`%"${s.name}"%`) as { c: number }
        ).c;
        return { name: s.name, description: s.description, count };
    });

    return {
        total_documents: total,
        documents_with_tree: withTree,
        types: filters.types,
        disciplines: filters.disciplines,
        shelves,
    };
}
