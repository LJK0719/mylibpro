import fs from "fs";
import path from "path";
import { Type } from "@google/genai";
import { getDb, recordToView, type DocumentRecord } from "../../db";
import {
    addActiveReference,
    checkContextBudget,
    getOrCreateSession,
} from "../workspace";
import { DATA_ROOT, resolveFullTextPath } from "./_shared";

export const loadFullTextDeclaration = {
    name: "load_full_text",
    description:
        "Load complete Markdown for a non-book document. For books/textbooks, this returns the chapter list and requires load_chapter; it must not load the whole book as one context unit.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            document_id: {
                type: Type.STRING,
                description: "The unique document_id from the library catalog.",
            },
        },
        required: ["document_id"],
    },
};

export function executeLoadFullText(
    args: Record<string, unknown>,
    sessionId: string
): Record<string, unknown> {
    const db = getDb();
    const documentId = args.document_id as string;
    const ws = getOrCreateSession(sessionId);

    if (
        checkContextBudget(ws).status === "critical" &&
        !ws.activeReferences.some((ref) => ref.documentId === documentId)
    ) {
        return {
            error:
                "Active full-text context is over the hard budget. Remove a low-value reference before loading another document.",
            document_id: documentId,
            context_budget: checkContextBudget(ws),
        };
    }

    const row = db
        .prepare(`SELECT * FROM documents WHERE document_id = ?`)
        .get(documentId) as DocumentRecord | undefined;

    if (!row) {
        return { error: `Document not found: ${documentId}` };
    }

    const view = recordToView(row);
    if (view.type === "book" && view.chapters.length > 0) {
        return {
            document_id: view.document_id,
            title: view.title,
            type: view.type,
            reading_unit: "chapter",
            requires_chapter_loading: true,
            chapters: view.chapters,
            chapters_count: view.chapters.length,
            message:
                "Books are loaded by chapter in MyLibPro. Choose an unread chapter_file_name and call load_chapter; do not load the whole book Markdown as one unit.",
        };
    }

    const alreadyRead = ws.readingHistory.some(
        (entry) =>
            entry.documentId === documentId &&
            entry.referenceKind === "document" &&
            !entry.chapterFileName &&
            Boolean(entry.keyFindings)
    );
    if (alreadyRead) {
        return {
            error:
                "This document has already been read and recorded in this research session. Choose a different unread document or answer from the existing evidence.",
            document_id: documentId,
            title: view.title,
            reading_unit: "document",
            already_read: true,
        };
    }

    const fullTextRelPath = resolveFullTextPath(view);
    const absolutePath = path.join(DATA_ROOT, fullTextRelPath);

    if (!fs.existsSync(absolutePath)) {
        return {
            error: `Full text file not found: ${fullTextRelPath}`,
            document_id: documentId,
            title: view.title,
        };
    }

    const content = fs.readFileSync(absolutePath, "utf-8");

    addActiveReference(sessionId, {
        documentId: view.document_id,
        referenceKind: "document",
        type: view.type,
        title: view.title,
        authors: view.authors,
        year: view.year,
        discipline: view.metadata_i18n.discipline.en,
        keywords: view.metadata_i18n.keywords.en,
        abstract:
            (view.metadata_i18n.abstract.en || view.abstract || "").length > 200
                ? (view.metadata_i18n.abstract.en || view.abstract || "").substring(0, 200) + "..."
                : view.metadata_i18n.abstract.en || view.abstract || "",
        tokenCount: view.token_count,
        citationInfo: view.citation_info || "",
        fullTextPath: fullTextRelPath,
        usefulness: "medium",
        reasonToKeep:
            "Full Markdown loaded for the current research task; update after reading.",
    });

    const budget = checkContextBudget(getOrCreateSession(sessionId));

    return {
        document_id: view.document_id,
        title: view.title,
        authors: view.authors,
        year: view.year,
        token_count: view.token_count,
        context_budget: budget,
        context_instruction:
            budget.status === "ok"
                ? "Read the complete Markdown, then call record_reading."
                : `${budget.message} Read this document, record findings, then consider remove_reference for low-value active references.`,
        full_text: content,
    };
}
