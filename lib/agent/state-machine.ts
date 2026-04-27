import type { FunctionDeclaration } from "@google/genai";
import {
    loadFullTextDeclaration,
    loadChapterDeclaration,
    getDocumentDetailDeclaration,
    recordReadingDeclaration,
    updateResearchNotesDeclaration,
    decideContinueOrAnswerDeclaration,
    removeReferenceDeclaration,
    allDeclarations,
} from "./tools";

export type WorkflowPhase =
    | "initial"
    | "must_read"
    | "must_record"
    | "must_notes"
    | "must_decide"
    | "can_decide";

export function getPhaseTools(phase: WorkflowPhase): FunctionDeclaration[] {
    switch (phase) {
        case "initial":
        case "can_decide":
            return allDeclarations as unknown as FunctionDeclaration[];
        case "must_read":
            return [
                getDocumentDetailDeclaration,
                loadFullTextDeclaration,
                loadChapterDeclaration,
                removeReferenceDeclaration,
                decideContinueOrAnswerDeclaration,
            ] as unknown as FunctionDeclaration[];
        case "must_record":
            return [recordReadingDeclaration] as unknown as FunctionDeclaration[];
        case "must_notes":
            return [updateResearchNotesDeclaration] as unknown as FunctionDeclaration[];
        case "must_decide":
            return [decideContinueOrAnswerDeclaration] as unknown as FunctionDeclaration[];
    }
}

export function isToolAllowedInPhase(
    phase: WorkflowPhase,
    toolName: string
): boolean {
    return getPhaseTools(phase).some((tool) => {
        const declaration = tool as unknown as { name?: string };
        return declaration.name === toolName;
    });
}

export function phaseAfterTool(
    currentPhase: WorkflowPhase,
    toolName: string,
    toolResult: Record<string, unknown>
): WorkflowPhase {
    switch (toolName) {
        case "search_library": {
            const total = toolResult.total as number;
            return total > 0 ? "must_read" : currentPhase;
        }
        case "load_full_text":
            return toolResult.requires_chapter_loading ? "must_read" : "must_record";
        case "load_chapter":
            return "must_record";
        case "record_reading":
            return "must_notes";
        case "update_research_notes":
            return "must_decide";
        case "decide_continue_or_answer":
            if (toolResult.decision === "answer") return "can_decide";
            return toolResult.decision === "search_more" ? "initial" : "must_read";
        default:
            return currentPhase;
    }
}

export function getPhaseHint(phase: WorkflowPhase): string {
    switch (phase) {
        case "must_read":
            return "\n\n[System note] Search returned results. If the user only needs a list or overview, call decide_continue_or_answer(decision=answer) and then answer. For deep research: for books/textbooks, call get_document_detail before load_chapter; for papers, call load_full_text. Do not load an evidence unit already present in Reading History.";
        case "must_record":
            return "\n\n[System note] You have loaded a minimum full-text unit. Call record_reading to save key findings. If the unit is a book chapter, include chapter_file_name.";
        case "must_notes":
            return "\n\n[System note] The reading record is complete. Call update_research_notes to update the research notebook.";
        case "must_decide":
            return "\n\n[System note] The research notebook has been updated. Call decide_continue_or_answer to explicitly decide whether to search more, read more, or answer from the evidence already read. If choosing read_more, the next evidence unit must be unread.";
        default:
            return "";
    }
}
