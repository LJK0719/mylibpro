/**
 * Agent Tool Definitions & Execution
 *
 * Defines Gemini Function Calling declarations and the actual
 * server-side implementations that query SQLite / read files.
 *
 * Tools are split into two categories:
 *   READ:  search_library, load_full_text, get_document_detail
 *   WRITE: record_reading, update_research_notes, remove_reference
 *
 * Individual declarations are exported so the chat route can
 * dynamically select which tools are available per workflow phase.
 */

import { Type } from "@google/genai";
import { getDb, recordToView, type DocumentView } from "./db";
import {
    addActiveReference,
    removeActiveReference,
    getOrCreateSession,
} from "./workspace";
import path from "path";
import fs from "fs";

// ─── Data root ─────────────────────────────────────────────────────
// 优先读取 DATA_ROOT 环境变量；未配置时默认指向项目上一级的 data 目录
const DATA_ROOT = process.env.DATA_ROOT
    ? path.resolve(process.cwd(), process.env.DATA_ROOT)
    : path.resolve(process.cwd(), "..", "data");

// ═══════════════════════════════════════════════════════════════════
// READ TOOLS — Function Declarations
// ═══════════════════════════════════════════════════════════════════

export const searchLibraryDeclaration = {
    name: "search_library",
    description:
        "Search the academic library catalog. Returns a list of document metadata (title, authors, year, keywords, abstract, token_count, etc.) matching the query. Does NOT return full text.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            query: {
                type: Type.STRING,
                description:
                    "Free-text search query. Searches across title, authors, keywords, abstract, discipline.",
            },
            type: {
                type: Type.STRING,
                enum: ["book", "paper"],
                description: "Filter by document type. Omit to search all types.",
            },
            discipline: {
                type: Type.STRING,
                description:
                    "Filter by discipline (Chinese label). Example: '统计学', '机器学习'. Omit to search all disciplines.",
            },
            limit: {
                type: Type.INTEGER,
                description:
                    "Maximum number of results to return. Default 10, max 30.",
            },
        },
        required: ["query"],
    },
};

export const loadFullTextDeclaration = {
    name: "load_full_text",
    description:
        "Load the complete Markdown full text of a specific document by its document_id. The document will be added to the active references table. The returned text can be very long. Only load documents that are highly relevant.",
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

export const getDocumentDetailDeclaration = {
    name: "get_document_detail",
    description:
        "Get detailed metadata of a document including its full abstract, table of contents (toc), citation info, keywords, and the list of available chapter files (chapters). Useful for deciding whether to load the full text and for determining reading order. When chapters are available, use load_chapter to load individual chapters instead of load_full_text.",
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

export const loadChapterDeclaration = {
    name: "load_chapter",
    description:
        "Load the Markdown content of a specific chapter of a document. Use get_document_detail first to obtain the list of available chapter file names. Only load the chapters that are relevant to the user's question.",
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

// ═══════════════════════════════════════════════════════════════════
// WRITE TOOLS — Workspace Management Function Declarations
// ═══════════════════════════════════════════════════════════════════

export const recordReadingDeclaration = {
    name: "record_reading",
    description:
        "Record your reading findings after analyzing a loaded document. The document stays in active references and a reading history entry is created.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            document_id: {
                type: Type.STRING,
                description: "The document_id of the document you finished reading.",
            },
            key_findings: {
                type: Type.STRING,
                description:
                    "A concise summary of the key findings extracted from this document, relevant to the user's question (max 500 chars).",
            },
            reading_purpose: {
                type: Type.STRING,
                description: "Why you read this document.",
            },
            citation_used: {
                type: Type.BOOLEAN,
                description: "Whether you will cite this document in your final answer.",
            },
        },
        required: ["document_id", "key_findings", "reading_purpose"],
    },
};

export const updateResearchNotesDeclaration = {
    name: "update_research_notes",
    description:
        "Update the research notebook with structured notes in Markdown format.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            notes: {
                type: Type.STRING,
                description:
                    "Markdown research notes. You should capture key insights, important data points, and open questions from your reading. Keep notes concise and relevant to the user's query.",
            },
            mode: {
                type: Type.STRING,
                enum: ["append", "replace"],
                description:
                    "'append' adds to existing notes. 'replace' overwrites completely.",
            },
        },
        required: ["notes", "mode"],
    },
};

export const removeReferenceDeclaration = {
    name: "remove_reference",
    description:
        "Remove a low-relevance document from active references to free context token budget. This is the only way to remove a document from the active references table.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            document_id: {
                type: Type.STRING,
                description: "The document_id to remove from active references.",
            },
            reason: {
                type: Type.STRING,
                description: "Why this reference is being removed.",
            },
        },
        required: ["document_id", "reason"],
    },
};

// ─── All declarations (for convenience) ──────────────────────────

export const allDeclarations = [
    searchLibraryDeclaration,
    loadFullTextDeclaration,
    loadChapterDeclaration,
    getDocumentDetailDeclaration,
    recordReadingDeclaration,
    updateResearchNotesDeclaration,
    removeReferenceDeclaration,
];

// ═══════════════════════════════════════════════════════════════════
// Tool execution
// ═══════════════════════════════════════════════════════════════════

export interface ToolResult {
    name: string;
    result: Record<string, unknown>;
}

/**
 * Execute a tool by name. sessionId is required for workspace tools.
 */
export function executeTool(
    name: string,
    args: Record<string, unknown>,
    sessionId: string
): ToolResult {
    switch (name) {
        case "search_library":
            return { name, result: executeSearchLibrary(args) };
        case "load_full_text":
            return { name, result: executeLoadFullText(args, sessionId) };
        case "load_chapter":
            return { name, result: executeLoadChapter(args, sessionId) };
        case "get_document_detail":
            return { name, result: executeGetDocumentDetail(args) };
        case "record_reading":
            return { name, result: executeRecordReading(args, sessionId) };
        case "update_research_notes":
            return { name, result: executeUpdateResearchNotes(args, sessionId) };
        case "remove_reference":
            return { name, result: executeRemoveReference(args, sessionId) };
        default:
            return { name, result: { error: `Unknown tool: ${name}` } };
    }
}

// ═══════════════════════════════════════════════════════════════════
// READ tool implementations
// ═══════════════════════════════════════════════════════════════════

function executeSearchLibrary(
    args: Record<string, unknown>
): Record<string, unknown> {
    const db = getDb();
    const query = (args.query as string) || "";
    const type = (args.type as string) || "";
    const discipline = (args.discipline as string) || "";
    const limit = Math.min(30, Math.max(1, (args.limit as number) || 10));

    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (query.trim()) {
        conditions.push(
            `d.document_id IN (SELECT document_id FROM documents_fts WHERE documents_fts MATCH @q)`
        );
        const escaped = query
            .trim()
            .replace(/['"]/g, "")
            .split(/\s+/)
            .map((t) => `"${t}"`)
            .join(" OR ");
        params.q = escaped;
    }

    if (type) {
        conditions.push(`d.type = @type`);
        params.type = type;
    }

    if (discipline) {
        conditions.push(`d.discipline LIKE @discipline`);
        params.discipline = `%${discipline}%`;
    }

    const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = db
        .prepare(
            `SELECT d.* FROM documents d ${whereClause} ORDER BY d.year DESC LIMIT @limit`
        )
        .all({ ...params, limit }) as import("./db").DocumentRecord[];

    const documents = rows.map((r) => {
        const view = recordToView(r);
        return {
            document_id: view.document_id,
            type: view.type,
            title: view.title,
            authors: view.authors,
            year: view.year,
            discipline: view.discipline,
            subdiscipline: view.subdiscipline,
            keywords: view.keywords,
            abstract:
                (view.abstract || "").length > 300
                    ? (view.abstract || "").substring(0, 300) + "..."
                    : view.abstract || "",
            token_count: view.token_count,
        };
    });

    return {
        total: documents.length,
        documents,
    };
}

function resolveFullTextPath(view: DocumentView): string {
    let ftPath = view.full_text_path;
    if (ftPath.startsWith("library/")) {
        ftPath = ftPath.replace(/^library\//, "");
    }
    return ftPath;
}

function executeLoadFullText(
    args: Record<string, unknown>,
    sessionId: string
): Record<string, unknown> {
    const db = getDb();
    const documentId = args.document_id as string;

    const row = db
        .prepare(`SELECT * FROM documents WHERE document_id = ?`)
        .get(documentId) as import("./db").DocumentRecord | undefined;

    if (!row) {
        return { error: `Document not found: ${documentId}` };
    }

    const view = recordToView(row);
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

    // Auto-add to active references (with fullTextPath)
    addActiveReference(sessionId, {
        documentId: view.document_id,
        type: view.type,
        title: view.title,
        authors: view.authors,
        year: view.year,
        discipline: view.discipline,
        keywords: view.keywords,
        abstract:
            (view.abstract || "").length > 200
                ? (view.abstract || "").substring(0, 200) + "..."
                : view.abstract || "",
        tokenCount: view.token_count,
        citationInfo: view.citation_info || "",
        fullTextPath: fullTextRelPath,
    });

    return {
        document_id: view.document_id,
        title: view.title,
        authors: view.authors,
        year: view.year,
        token_count: view.token_count,
        full_text: content,
    };
}

function executeLoadChapter(
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
        .get(documentId) as import("./db").DocumentRecord | undefined;

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
        };
    }

    const content = fs.readFileSync(chapterPath, "utf-8");

    // Add to active references (idempotent — workspace will deduplicate)
    addActiveReference(sessionId, {
        documentId: view.document_id,
        type: view.type,
        title: view.title,
        authors: view.authors,
        year: view.year,
        discipline: view.discipline,
        keywords: view.keywords,
        abstract:
            (view.abstract || "").length > 200
                ? (view.abstract || "").substring(0, 200) + "..."
                : view.abstract || "",
        tokenCount: view.token_count,
        citationInfo: view.citation_info || "",
        fullTextPath: `${view.type}/${view.folder_name}/chapters/${chapterFileName}`,
    });

    return {
        document_id: view.document_id,
        title: view.title,
        chapter_file_name: chapterFileName,
        content,
    };
}

function executeGetDocumentDetail(
    args: Record<string, unknown>
): Record<string, unknown> {
    const db = getDb();
    const documentId = args.document_id as string;

    const row = db
        .prepare(`SELECT * FROM documents WHERE document_id = ?`)
        .get(documentId) as import("./db").DocumentRecord | undefined;

    if (!row) {
        return { error: `Document not found: ${documentId}` };
    }

    const view: DocumentView = recordToView(row);

    let citationText = view.citation_info;
    if (citationText && citationText.startsWith("library/")) {
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
        authors: view.authors,
        year: view.year,
        discipline: view.discipline,
        subdiscipline: view.subdiscipline,
        keywords: view.keywords,
        abstract: view.abstract,
        toc: view.toc,
        token_count: view.token_count,
        citation_info: citationText,
        chapters: view.chapters,
        chapters_hint: view.chapters.length > 0
            ? `This book has ${view.chapters.length} chapter file(s). Use load_chapter with one of the chapter_file_name values above to read specific chapters. Prefer this over load_full_text.`
            : "No individual chapter files available. Use load_full_text to read the full document.",
    };
}

// ═══════════════════════════════════════════════════════════════════
// WRITE tool implementations (workspace management)
// ═══════════════════════════════════════════════════════════════════

function executeRecordReading(
    args: Record<string, unknown>,
    sessionId: string
): Record<string, unknown> {
    const documentId = args.document_id as string;
    const keyFindings = args.key_findings as string;
    const readingPurpose = args.reading_purpose as string;
    const citationUsed = (args.citation_used as boolean) ?? true;

    const ws = getOrCreateSession(sessionId);
    const ref = ws.activeReferences.find((r) => r.documentId === documentId);

    if (!ref) {
        return {
            error: `Document ${documentId} not found in active references.`,
        };
    }

    // ─── 设计方案 J1: 仅新增阅读历史记录 ─────────────────────────
    // 即使该文献之前已阅读过，也追加一条新的历史记录，保留研究过程的完整轨迹。
    // 文献保留在参考文献表中，不移除。移除操作由 remove_reference (J3) 单独处理。
    ws.readingHistory.push({
        historyId: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        documentId: ref.documentId,
        type: ref.type,
        title: ref.title,
        readTimestamp: new Date().toISOString(),
        readingPurpose,
        keyFindings,
        removedReason: "",
        citationUsed,
        citationInfo: ref.citationInfo,
        markdownPath: ref.fullTextPath,
    });

    return {
        success: true,
        document_id: documentId,
        title: ref.title,
        message: `已记录 "${ref.title}" 的阅读发现。文献仍保留在参考文献表中。`,
        active_references_count: ws.activeReferences.length,
        reading_history_count: ws.readingHistory.length,
        total_tokens: ws.totalTokens,
    };
}

function executeUpdateResearchNotes(
    args: Record<string, unknown>,
    sessionId: string
): Record<string, unknown> {
    const notes = (args.notes as string) || "";
    const mode = (args.mode as string) || "append";

    const ws = getOrCreateSession(sessionId);

    if (mode === "replace") {
        ws.researchNotebook = notes;
    } else {
        if (ws.researchNotebook) {
            ws.researchNotebook += `\n\n---\n\n${notes}`;
        } else {
            ws.researchNotebook = notes;
        }
    }

    return {
        success: true,
        message: `研究笔记已${mode === "replace" ? "替换" : "追加"}更新。`,
        notebook_length: (ws.researchNotebook || "").length,
    };
}

function executeRemoveReference(
    args: Record<string, unknown>,
    sessionId: string
): Record<string, unknown> {
    const documentId = args.document_id as string;
    const reason = args.reason as string;

    const ws = getOrCreateSession(sessionId);
    const ref = ws.activeReferences.find((r) => r.documentId === documentId);

    if (!ref) {
        return {
            error: `Document ${documentId} not found in active references.`,
        };
    }

    removeActiveReference(sessionId, documentId, reason);

    return {
        success: true,
        document_id: documentId,
        title: ref.title,
        message: `已从参考文献中移除 "${ref.title}"。原因: ${reason}`,
        active_references_count: ws.activeReferences.length,
        total_tokens: ws.totalTokens,
    };
}
