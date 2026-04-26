import { Type } from "@google/genai";
import { getDb, recordToView, type DocumentRecord } from "../../db";
import { buildSearchQuery } from "../../search/cjk";
import { disciplineSearchTerms } from "../../search/disciplines";

export const searchLibraryDeclaration = {
    name: "search_library",
    description:
        "Search the academic library catalog. Returns document metadata only. For books, the next reading unit must be a chapter, not the whole book.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            query: {
                type: Type.STRING,
                description:
                    "Free-text search query in English. Translate the user's research terms to English before calling this tool.",
            },
            type: {
                type: Type.STRING,
                enum: ["book", "paper"],
                description: "Filter by document type. Omit to search all types.",
            },
            discipline: {
                type: Type.STRING,
                description:
                    "Filter by discipline in English. Examples: 'statistics', 'machine learning', 'finance'. Omit to search all disciplines.",
            },
        },
        required: ["query"],
    },
};

export function executeSearchLibrary(
    args: Record<string, unknown>
): Record<string, unknown> {
    const db = getDb();
    const query = (args.query as string) || "";
    const type = (args.type as string) || "";
    const discipline = (args.discipline as string) || "";
    const limit = Math.min(30, Math.max(1, (args.limit as number) || 10));

    const params: Record<string, unknown> = { limit };

    let sql: string;
    if (query.trim()) {
        const escaped = buildSearchQuery(query);
        if (!escaped) {
            return { total: 0, documents: [] };
        }
        params.q = escaped;

        const filters: string[] = [];
        if (type) { filters.push(`d.type = @type`); params.type = type; }
        if (discipline) {
            const disciplineClauses = disciplineSearchTerms(discipline).map((term, index) => {
                const key = `discipline${index}`;
                params[key] = `%${term}%`;
                return `(d.discipline LIKE @${key} OR d.discipline_en LIKE @${key})`;
            });
            filters.push(`(${disciplineClauses.join(" OR ")})`);
        }
        const filterClause = filters.length > 0 ? `AND ${filters.join(" AND ")}` : "";

        sql = `SELECT d.* FROM documents_fts fts JOIN documents d ON d.document_id = fts.document_id
               WHERE fts.documents_fts MATCH @q ${filterClause} ORDER BY fts.rank`;
    } else {
        const filters: string[] = [];
        if (type) { filters.push(`type = @type`); params.type = type; }
        if (discipline) {
            const disciplineClauses = disciplineSearchTerms(discipline).map((term, index) => {
                const key = `discipline${index}`;
                params[key] = `%${term}%`;
                return `(discipline LIKE @${key} OR discipline_en LIKE @${key})`;
            });
            filters.push(`(${disciplineClauses.join(" OR ")})`);
        }
        const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
        sql = `SELECT * FROM documents ${whereClause} ORDER BY year DESC LIMIT @limit`;
    }

    const rows = db.prepare(sql).all(params) as DocumentRecord[];

    const documents = rows.map((r) => {
        const view = recordToView(r);
        return {
            document_id: view.document_id,
            type: view.type,
            title: view.title,
            title_i18n: view.metadata_i18n.title,
            authors: view.authors,
            authors_i18n: view.metadata_i18n.authors,
            year: view.year,
            discipline: view.metadata_i18n.discipline.en,
            discipline_i18n: view.metadata_i18n.discipline,
            subdiscipline: view.metadata_i18n.subdiscipline.en,
            subdiscipline_i18n: view.metadata_i18n.subdiscipline,
            keywords: view.metadata_i18n.keywords.en,
            keywords_i18n: view.metadata_i18n.keywords,
            abstract:
                (view.metadata_i18n.abstract.en || view.abstract || "").length > 300
                    ? (view.metadata_i18n.abstract.en || view.abstract || "").substring(0, 300) + "..."
                    : view.metadata_i18n.abstract.en || view.abstract || "",
            abstract_i18n: view.metadata_i18n.abstract,
            token_count: view.token_count,
            reading_unit: view.type === "book" ? "chapter" : "document",
            chapters_count: view.chapters.length,
            has_chapters: view.chapters.length > 0,
        };
    });

    return {
        total: documents.length,
        documents,
    };
}
