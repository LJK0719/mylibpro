import fs from "fs";
import path from "path";
import { Type } from "@google/genai";
import {
    getDb,
    recordToView,
    type DocumentRecord,
    type DocumentView,
} from "../../db";
import { DATA_ROOT } from "./_shared";

export const getDocumentDetailDeclaration = {
    name: "get_document_detail",
    description:
        "Get detailed metadata including abstract, table of contents, citation info, keywords, and chapter files. For books, use the returned chapters as the authoritative loading units.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            document_id: {
                type: Type.STRING,
                description: "The unique document_id.",
            },
        },
        required: ["document_id"],
    },
};

export function executeGetDocumentDetail(
    args: Record<string, unknown>
): Record<string, unknown> {
    const db = getDb();
    const documentId = args.document_id as string;

    const row = db
        .prepare(`SELECT * FROM documents WHERE document_id = ?`)
        .get(documentId) as DocumentRecord | undefined;

    if (!row) {
        return { error: `Document not found: ${documentId}` };
    }

    const view: DocumentView = recordToView(row);

    // `citation_info` is a path relative to DATA_ROOT (canonical:
    // `<type>/<folder>/ref.txt`; legacy `library/` prefix tolerated).
    // Resolve it to the file's contents for the agent.
    let citationText = view.citation_info;
    if (citationText) {
        const citePath = path.join(
            DATA_ROOT,
            citationText.replace(/^library\//, "")
        );
        if (fs.existsSync(citePath)) {
            citationText = fs.readFileSync(citePath, "utf-8");
        }
    }

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
        abstract: view.metadata_i18n.abstract.en || view.abstract,
        abstract_i18n: view.metadata_i18n.abstract,
        toc: view.metadata_i18n.toc.en || view.toc,
        toc_i18n: view.metadata_i18n.toc,
        token_count: view.token_count,
        citation_info: citationText,
        reading_unit: view.type === "book" && view.chapters.length > 0
            ? "chapter"
            : "document",
        chapters: view.chapters,
        chapters_hint: view.chapters.length > 0
            ? `This book has ${view.chapters.length} chapter file(s). Books must be loaded with load_chapter; do not load the whole book full_text.md.`
            : "No individual chapter files available. Use load_full_text to read the full document.",
    };
}
