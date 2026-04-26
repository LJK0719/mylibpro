/**
 * In-memory workspace state — session map, mutators, snapshot.
 *
 * The workspace is intentionally session scoped. It keeps the full-text
 * context that is currently active, plus durable reading history, trace
 * events, and reusable artifacts for the running research task.
 */

import {
    CONTEXT_BUDGET,
    type ActiveReference,
    type ContextBudgetStatus,
    type ReadingHistoryEntry,
    type ResearchArtifact,
    type ResearchEvent,
    type ResearchSession,
    type WorkspaceState,
} from "./types";

const sessions = new Map<string, WorkspaceState>();

function newId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function now(): string {
    return new Date().toISOString();
}

function touch(ws: WorkspaceState): void {
    ws.updatedAt = now();
    ws.session.updatedAt = ws.updatedAt;
}

function recalculateTokens(ws: WorkspaceState): void {
    ws.totalTokens = ws.activeReferences.reduce(
        (sum, ref) => sum + ref.tokenCount,
        0
    );
}

export function createSession(sessionId: string, userQuery = ""): WorkspaceState {
    const createdAt = now();
    const state: WorkspaceState = {
        sessionId,
        session: {
            sessionId,
            userQuery,
            status: "active",
            createdAt,
            updatedAt: createdAt,
        },
        activeReferences: [],
        readingHistory: [],
        researchNotebook: "",
        totalTokens: 0,
        createdAt,
        updatedAt: createdAt,
        events: [],
        artifacts: [],
    };
    sessions.set(sessionId, state);
    return state;
}

export function getSession(sessionId: string): WorkspaceState | undefined {
    return sessions.get(sessionId);
}

export function getOrCreateSession(sessionId: string, userQuery = ""): WorkspaceState {
    const existing = sessions.get(sessionId);
    if (existing) {
        if (userQuery && !existing.session.userQuery) {
            existing.session.userQuery = userQuery;
            touch(existing);
        }
        return existing;
    }
    return createSession(sessionId, userQuery);
}

export function deleteSession(sessionId: string): void {
    sessions.delete(sessionId);
}

export function updateSession(
    sessionId: string,
    patch: Partial<Pick<ResearchSession, "userQuery" | "status" | "activeSkill">>
): WorkspaceState {
    const ws = getOrCreateSession(sessionId);
    ws.session = { ...ws.session, ...patch, updatedAt: now() };
    ws.updatedAt = ws.session.updatedAt;
    return ws;
}

export function checkContextBudget(ws: WorkspaceState): ContextBudgetStatus {
    if (ws.totalTokens >= CONTEXT_BUDGET.hard_limit) {
        return {
            status: "critical",
            totalTokens: ws.totalTokens,
            softLimit: CONTEXT_BUDGET.soft_limit,
            hardLimit: CONTEXT_BUDGET.hard_limit,
            message:
                "The active full-text context is over the hard budget. Remove low-value references before loading more.",
        };
    }
    if (ws.totalTokens >= CONTEXT_BUDGET.soft_limit) {
        return {
            status: "warning",
            totalTokens: ws.totalTokens,
            softLimit: CONTEXT_BUDGET.soft_limit,
            hardLimit: CONTEXT_BUDGET.hard_limit,
            message:
                "The active full-text context is near the budget. Evaluate reference usefulness and remove low-value documents if needed.",
        };
    }
    return {
        status: "ok",
        totalTokens: ws.totalTokens,
        softLimit: CONTEXT_BUDGET.soft_limit,
        hardLimit: CONTEXT_BUDGET.hard_limit,
    };
}

export function addActiveReference(
    sessionId: string,
    ref: Omit<ActiveReference, "referenceId" | "loadedAt">
): ActiveReference {
    const ws = getOrCreateSession(sessionId);
    const normalizedRef = {
        ...ref,
        referenceKind: ref.referenceKind || "document",
    };
    const existing = ws.activeReferences.find(
        (item) =>
            item.documentId === normalizedRef.documentId &&
            item.chapterFileName === normalizedRef.chapterFileName
    );

    if (existing) {
        existing.usefulness = normalizedRef.usefulness || existing.usefulness;
        existing.reasonToKeep = normalizedRef.reasonToKeep || existing.reasonToKeep;
        touch(ws);
        return existing;
    }

    const entry: ActiveReference = {
        ...normalizedRef,
        referenceId: newId("ref"),
        loadedAt: now(),
    };

    ws.activeReferences.push(entry);
    recalculateTokens(ws);
    touch(ws);
    return entry;
}

export function removeActiveReference(
    sessionId: string,
    documentId: string,
    reason: string,
    keyFindings = "",
    chapterFileName?: string
): ActiveReference | undefined {
    const ws = getOrCreateSession(sessionId);
    const idx = ws.activeReferences.findIndex(
        (ref) =>
            ref.documentId === documentId &&
            (!chapterFileName || ref.chapterFileName === chapterFileName)
    );
    if (idx === -1) return undefined;

    const [removed] = ws.activeReferences.splice(idx, 1);
    const alreadyRead = ws.readingHistory.some(
        (entry) =>
            entry.documentId === removed.documentId &&
            entry.chapterFileName === removed.chapterFileName &&
            entry.keyFindings
    );

    if (!alreadyRead || keyFindings) {
        ws.readingHistory.push({
            historyId: newId("hist"),
            documentId: removed.documentId,
            referenceKind: removed.referenceKind,
            chapterFileName: removed.chapterFileName,
            type: removed.type,
            title: removed.title,
            readTimestamp: now(),
            readingPurpose: "Reference removed from active context",
            keyFindings,
            removedReason: reason,
            citationUsed: false,
            citationInfo: removed.citationInfo,
            markdownPath: removed.fullTextPath,
            usefulness: removed.usefulness,
        });
    }

    recalculateTokens(ws);
    touch(ws);
    return removed;
}

export function appendReadingHistory(
    sessionId: string,
    entry: Omit<ReadingHistoryEntry, "historyId" | "readTimestamp">
): ReadingHistoryEntry {
    const ws = getOrCreateSession(sessionId);
    const historyEntry: ReadingHistoryEntry = {
        ...entry,
        historyId: newId("hist"),
        readTimestamp: now(),
    };
    ws.readingHistory.push(historyEntry);
    touch(ws);
    return historyEntry;
}

export function updateResearchNotebook(
    sessionId: string,
    notes: string,
    mode: "append" | "replace" = "append"
): string {
    const ws = getOrCreateSession(sessionId);
    if (mode === "replace") {
        ws.researchNotebook = notes;
    } else if (ws.researchNotebook) {
        ws.researchNotebook += `\n\n---\n\n${notes}`;
    } else {
        ws.researchNotebook = notes;
    }
    touch(ws);
    return ws.researchNotebook;
}

export function recordEvent(
    sessionId: string,
    event: Omit<ResearchEvent, "eventId" | "sessionId" | "createdAt">
): ResearchEvent {
    const ws = getOrCreateSession(sessionId);
    const entry: ResearchEvent = {
        ...event,
        eventId: newId("evt"),
        sessionId,
        createdAt: now(),
    };
    ws.events.push(entry);
    touch(ws);
    return entry;
}

export function addArtifact(
    sessionId: string,
    artifact: Omit<ResearchArtifact, "artifactId" | "sessionId" | "createdAt">
): ResearchArtifact {
    const ws = getOrCreateSession(sessionId);
    const entry: ResearchArtifact = {
        ...artifact,
        artifactId: newId("art"),
        sessionId,
        createdAt: now(),
    };
    ws.artifacts.push(entry);
    touch(ws);
    return entry;
}

export function getSessionEvents(sessionId: string): ResearchEvent[] {
    return getSession(sessionId)?.events || [];
}

export function getSessionArtifacts(
    sessionId: string,
    type?: ResearchArtifact["type"]
): ResearchArtifact[] {
    const artifacts = getSession(sessionId)?.artifacts || [];
    return type ? artifacts.filter((artifact) => artifact.type === type) : artifacts;
}

export function getWorkspaceSnapshot(sessionId: string) {
    const ws = getOrCreateSession(sessionId);
    return {
        sessionId: ws.sessionId,
        session: ws.session,
        activeReferences: ws.activeReferences,
        readingHistory: ws.readingHistory,
        researchNotebook: ws.researchNotebook,
        totalTokens: ws.totalTokens,
        events: ws.events,
        artifacts: ws.artifacts,
        contextBudget: checkContextBudget(ws),
    };
}
