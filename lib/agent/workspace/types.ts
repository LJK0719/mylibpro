/**
 * Workspace types — pure interface declarations, no runtime logic.
 */

export type SessionStatus = "active" | "waiting" | "completed" | "failed";
export type Usefulness = "high" | "medium" | "low";

export const CONTEXT_BUDGET = {
    soft_limit: 800_000,
    hard_limit: 1_000_000,
} as const;

export interface ResearchSession {
    sessionId: string;
    userQuery: string;
    status: SessionStatus;
    createdAt: string;
    updatedAt: string;
    activeSkill?: string;
}

export interface ResearchEvent {
    eventId: string;
    sessionId: string;
    type:
        | "skill_selected"
        | "library_searched"
        | "document_detail_viewed"
        | "fulltext_loaded"
        | "chapter_loaded"
        | "document_read"
        | "reference_activated"
        | "reference_removed"
        | "notebook_updated"
        | "answer_generated";
    documentId?: string;
    payload: Record<string, unknown>;
    createdAt: string;
}

export interface ResearchArtifact {
    artifactId: string;
    sessionId: string;
    type: "reading_note" | "evidence_summary" | "citation_list" | "final_answer";
    title: string;
    contentMarkdown: string;
    sourceDocumentIds: string[];
    createdAt: string;
}

export interface ActiveReference {
    referenceId: string;
    documentId: string;
    referenceKind: "document" | "chapter";
    chapterFileName?: string;
    type: string;
    title: string;
    authors: string[];
    year: number;
    discipline: string[];
    keywords: string[];
    abstract: string;
    tokenCount: number;
    citationInfo: string;
    fullTextPath: string;
    loadedAt: string;
    usefulness: Usefulness;
    reasonToKeep: string;
}

export interface ReadingHistoryEntry {
    historyId: string;
    documentId: string;
    referenceKind: "document" | "chapter";
    chapterFileName?: string;
    type: string;
    title: string;
    readTimestamp: string;
    readingPurpose: string;
    keyFindings: string;
    removedReason: string;
    citationUsed: boolean;
    citationInfo: string;
    markdownPath: string;
    usefulness: Usefulness;
}

export interface WorkspaceState {
    sessionId: string;
    session: ResearchSession;
    activeReferences: ActiveReference[];
    readingHistory: ReadingHistoryEntry[];
    researchNotebook: string;
    totalTokens: number;
    createdAt: string;
    updatedAt: string;
    events: ResearchEvent[];
    artifacts: ResearchArtifact[];
}

export interface ContextBudgetStatus {
    status: "ok" | "warning" | "critical";
    totalTokens: number;
    softLimit: number;
    hardLimit: number;
    message?: string;
}
