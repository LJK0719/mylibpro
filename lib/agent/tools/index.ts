/**
 * Agent tools barrel.
 *
 * One file per tool under this directory; this index aggregates the
 * declarations into `allDeclarations` and exposes the runtime
 * dispatcher `executeTool`. The chat route imports from
 * `@/lib/agent/tools` and resolves to this barrel.
 */

import { recordEvent, type ResearchEvent } from "../workspace";

import {
    searchLibraryDeclaration,
    executeSearchLibrary,
} from "./search_library";
import {
    loadFullTextDeclaration,
    executeLoadFullText,
} from "./load_full_text";
import {
    loadChapterDeclaration,
    executeLoadChapter,
} from "./load_chapter";
import {
    getDocumentDetailDeclaration,
    executeGetDocumentDetail,
} from "./get_document_detail";
import {
    recordReadingDeclaration,
    executeRecordReading,
} from "./record_reading";
import {
    updateResearchNotesDeclaration,
    executeUpdateResearchNotes,
} from "./update_research_notes";
import {
    decideContinueOrAnswerDeclaration,
    executeDecideContinueOrAnswer,
} from "./decide_continue_or_answer";
import {
    removeReferenceDeclaration,
    executeRemoveReference,
} from "./remove_reference";

export {
    searchLibraryDeclaration,
    loadFullTextDeclaration,
    loadChapterDeclaration,
    getDocumentDetailDeclaration,
    recordReadingDeclaration,
    updateResearchNotesDeclaration,
    decideContinueOrAnswerDeclaration,
    removeReferenceDeclaration,
};

export const allDeclarations = [
    searchLibraryDeclaration,
    loadFullTextDeclaration,
    loadChapterDeclaration,
    getDocumentDetailDeclaration,
    recordReadingDeclaration,
    updateResearchNotesDeclaration,
    decideContinueOrAnswerDeclaration,
    removeReferenceDeclaration,
];

export interface ToolResult {
    name: string;
    result: Record<string, unknown>;
}

function mapToolToEventType(name: string): ResearchEvent["type"] {
    const mapping: Record<string, ResearchEvent["type"]> = {
        search_library: "library_searched",
        get_document_detail: "document_detail_viewed",
        load_full_text: "fulltext_loaded",
        load_chapter: "chapter_loaded",
        record_reading: "document_read",
        update_research_notes: "notebook_updated",
        remove_reference: "reference_removed",
        decide_continue_or_answer: "skill_selected",
    };
    return mapping[name] || "skill_selected";
}

function compactToolResult(result: Record<string, unknown>): Record<string, unknown> {
    const compact = { ...result };
    if (typeof compact.full_text === "string") {
        compact.full_text_length = compact.full_text.length;
        delete compact.full_text;
    }
    if (typeof compact.content === "string") {
        compact.content_length = compact.content.length;
        delete compact.content;
    }
    return compact;
}

/**
 * Execute a tool by name. sessionId is required for workspace tools.
 */
export function executeTool(
    name: string,
    args: Record<string, unknown>,
    sessionId: string
): ToolResult {
    let result: Record<string, unknown>;

    switch (name) {
        case "search_library":
            result = executeSearchLibrary(args);
            break;
        case "load_full_text":
            result = executeLoadFullText(args, sessionId);
            break;
        case "load_chapter":
            result = executeLoadChapter(args, sessionId);
            break;
        case "get_document_detail":
            result = executeGetDocumentDetail(args);
            break;
        case "record_reading":
            result = executeRecordReading(args, sessionId);
            break;
        case "update_research_notes":
            result = executeUpdateResearchNotes(args, sessionId);
            break;
        case "decide_continue_or_answer":
            result = executeDecideContinueOrAnswer(args, sessionId);
            break;
        case "remove_reference":
            result = executeRemoveReference(args, sessionId);
            break;
        default:
            result = { error: `Unknown tool: ${name}` };
    }

    if (!("error" in result)) {
        const eventType =
            name === "load_full_text" && result.requires_chapter_loading
                ? "document_detail_viewed"
                : mapToolToEventType(name);
        recordEvent(sessionId, {
            type: eventType,
            documentId: (args.document_id as string | undefined) ||
                (result.document_id as string | undefined),
            payload: {
                args,
                result: compactToolResult(result),
            },
        });
    }

    return { name, result };
}
