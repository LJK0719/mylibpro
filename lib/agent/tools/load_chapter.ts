import fs from "fs";
import path from "path";
import { Type } from "@google/genai";
import { getDb, recordToView, type DocumentRecord } from "../../db";
import {
    addActiveReference,
    checkContextBudget,
    getOrCreateSession,
} from "../workspace";
import { DATA_ROOT } from "./_shared";

export const loadChapterDeclaration = {
    name: "load_chapter",
    description:
        "Load one Markdown chapter from a book/textbook. This is the minimum full-text loading unit for books. Read chapters in an explicit order and record findings for each loaded chapter.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            document_id: {
                type: Type.STRING,
                description: "The unique document_id from the library catalog.",
            },
            chapter_file_name: {
                type: Type.STRING,
                description: "The chapter file name (e.g. '02_Chapter_1_Introduction.md') as returned by get_document_detail.",
            },
        },
        required: ["document_id", "chapter_file_name"],
    },
};

export function executeLoadChapter(
    args: Record<string, unknown>,
    sessionId: string
): Record<string, unknown> {
    const db = getDb();
    const documentId = args.document_id as string;
    const chapterFileName = args.chapter_file_name as string;

    if (!chapterFileName || chapterFileName.includes("..") || chapterFileName.includes("/") || chapterFileName.includes("\\")) {
        return { error: "Invalid chapter_file_name." };
    }

    const row = db
        .prepare(`SELECT * FROM documents WHERE document_id = ?`)
        .get(documentId) as DocumentRecord | undefined;

    if (!row) {
        return { error: `Document not found: ${documentId}` };
    }

    const view = recordToView(row);

    if (view.chapters.length > 0 && !view.chapters.includes(chapterFileName)) {
        return {
            error: `Chapter "${chapterFileName}" not found in this document.`,
            available_chapters: view.chapters,
        };
    }

    const ws = getOrCreateSession(sessionId);
    const alreadyRead = ws.readingHistory.some(
        (entry) =>
            entry.documentId === documentId &&
            entry.chapterFileName === chapterFileName &&
            Boolean(entry.keyFindings)
    );
    if (alreadyRead) {
        return {
            error:
                "This chapter has already been read and recorded in this research session. Choose a different unread chapter or answer from the existing evidence.",
            document_id: documentId,
            title: view.title,
            reading_unit: "chapter",
            chapter_file_name: chapterFileName,
            already_read: true,
        };
    }

    const chapterPath = path.join(
        DATA_ROOT,
        view.type,
        view.folder_name,
        "chapters",
        chapterFileName
    );

    if (!fs.existsSync(chapterPath)) {
        return {
            error: `Chapter file not found on disk: ${chapterFileName}`,
            document_id: documentId,
            title: view.title,
            attempted_path: chapterPath,
        };
    }

    const content = fs.readFileSync(chapterPath, "utf-8");

    addActiveReference(sessionId, {
        documentId: view.document_id,
        referenceKind: "chapter",
        chapterFileName,
        type: view.type,
        title: `${view.title} / ${chapterFileName}`,
        authors: view.authors,
        year: view.year,
        discipline: view.metadata_i18n.discipline.en,
        keywords: view.metadata_i18n.keywords.en,
        abstract:
            (view.metadata_i18n.abstract.en || view.abstract || "").length > 200
                ? (view.metadata_i18n.abstract.en || view.abstract || "").substring(0, 200) + "..."
                : view.metadata_i18n.abstract.en || view.abstract || "",
        tokenCount: Math.ceil(content.length / 4),
        citationInfo: view.citation_info || "",
        fullTextPath: `${view.type}/${view.folder_name}/chapters/${chapterFileName}`,
        usefulness: "medium",
        reasonToKeep:
            "Book chapter Markdown loaded as the minimum full-text unit.",
    });

    return {
        document_id: view.document_id,
        title: view.title,
        reading_unit: "chapter",
        chapter_file_name: chapterFileName,
        chapter_index: view.chapters.indexOf(chapterFileName),
        chapters_count: view.chapters.length,
        context_budget: checkContextBudget(ws),
        content,
    };
}
