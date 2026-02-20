/**
 * Workspace State Management
 *
 * In-memory session-based workspace for the RAG agent.
 * Tracks active references, reading history, and research notebook.
 *
 * Field structure matches the design doc §3.2 exactly.
 */

// ─── 参考文献表 (Active References) — 设计方案 §3.2 ──────────────

export interface ActiveReference {
    referenceId: string;
    documentId: string;
    type: string;
    title: string;
    authors: string[];
    year: number;
    discipline: string[];
    keywords: string[];
    abstract: string;
    tokenCount: number;
    citationInfo: string;
    fullTextPath: string; // 全文 Markdown 存储路径（可按需重新加载）
    loadedAt: string;
}

// ─── 阅读历史表 (Reading History) — 设计方案 §3.2 ────────────────

export interface ReadingHistoryEntry {
    historyId: string;
    documentId: string;
    type: string;
    title: string;
    readTimestamp: string;
    readingPurpose: string;
    keyFindings: string;
    removedReason: string;
    citationUsed: boolean;
    citationInfo: string;
    markdownPath: string; // 全文路径（可按需重新加载）
}

// ─── 工作区状态 ──────────────────────────────────────────────────

export interface WorkspaceState {
    sessionId: string;
    activeReferences: ActiveReference[];
    readingHistory: ReadingHistoryEntry[];
    researchNotebook: string;
    totalTokens: number;
    createdAt: string;
}

// ─── In-memory store ─────────────────────────────────────────────

const sessions = new Map<string, WorkspaceState>();

export function createSession(sessionId: string): WorkspaceState {
    const state: WorkspaceState = {
        sessionId,
        activeReferences: [],
        readingHistory: [],
        researchNotebook: "",
        totalTokens: 0,
        createdAt: new Date().toISOString(),
    };
    sessions.set(sessionId, state);
    return state;
}

export function getSession(sessionId: string): WorkspaceState | undefined {
    return sessions.get(sessionId);
}

export function getOrCreateSession(sessionId: string): WorkspaceState {
    return sessions.get(sessionId) || createSession(sessionId);
}

export function deleteSession(sessionId: string): void {
    sessions.delete(sessionId);
}

// ─── Workspace operations ────────────────────────────────────────

export function addActiveReference(
    sessionId: string,
    ref: Omit<ActiveReference, "referenceId" | "loadedAt">
): ActiveReference {
    const ws = getOrCreateSession(sessionId);

    // Check if already exists
    const existing = ws.activeReferences.find(
        (r) => r.documentId === ref.documentId
    );
    if (existing) return existing;

    const entry: ActiveReference = {
        ...ref,
        referenceId: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        loadedAt: new Date().toISOString(),
    };

    ws.activeReferences.push(entry);
    ws.totalTokens = ws.activeReferences.reduce(
        (sum, r) => sum + r.tokenCount,
        0
    );

    return entry;
}

export function removeActiveReference(
    sessionId: string,
    documentId: string,
    reason: string
): void {
    const ws = getOrCreateSession(sessionId);
    const idx = ws.activeReferences.findIndex(
        (r) => r.documentId === documentId
    );
    if (idx === -1) return;

    const removed = ws.activeReferences.splice(idx, 1)[0];

    // Move to reading history
    ws.readingHistory.push({
        historyId: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        documentId: removed.documentId,
        type: removed.type,
        title: removed.title,
        readTimestamp: new Date().toISOString(),
        readingPurpose: "",
        keyFindings: "",
        removedReason: reason,
        citationUsed: false,
        citationInfo: removed.citationInfo,
        markdownPath: removed.fullTextPath,
    });

    ws.totalTokens = ws.activeReferences.reduce(
        (sum, r) => sum + r.tokenCount,
        0
    );
}

export function updateResearchNotebook(
    sessionId: string,
    notebook: string
): void {
    const ws = getOrCreateSession(sessionId);
    ws.researchNotebook = notebook;
}

export function getWorkspaceSummary(sessionId: string): string {
    const ws = getOrCreateSession(sessionId);

    const lines: string[] = [];
    lines.push(`## 当前工作区状态`);
    lines.push("");

    // Active references
    lines.push(
        `### 参考文献表 (${ws.activeReferences.length} 篇, 共 ${ws.totalTokens.toLocaleString()} tokens)`
    );
    if (ws.activeReferences.length === 0) {
        lines.push("暂无激活的参考文献。");
    } else {
        for (const ref of ws.activeReferences) {
            lines.push(
                `- **${ref.title}** (${ref.authors.join(", ")}, ${ref.year}) — ${ref.tokenCount.toLocaleString()} tokens [ID: ${ref.documentId}]`
            );
        }
    }
    lines.push("");

    // Reading history
    lines.push(`### 阅读历史 (${ws.readingHistory.length} 篇)`);
    if (ws.readingHistory.length === 0) {
        lines.push("暂无阅读历史。");
    } else {
        for (const h of ws.readingHistory.slice(-5)) {
            lines.push(
                `- ${h.title} — ${h.keyFindings ? "发现: " + h.keyFindings.substring(0, 80) : "移除原因: " + (h.removedReason || "N/A")}`
            );
        }
    }
    lines.push("");

    // Research notebook
    if (ws.researchNotebook) {
        lines.push(`### 研究笔记`);
        lines.push(ws.researchNotebook);
    }

    return lines.join("\n");
}

/**
 * Returns a serializable workspace snapshot for the frontend.
 */
export function getWorkspaceSnapshot(sessionId: string) {
    const ws = getOrCreateSession(sessionId);
    return {
        sessionId: ws.sessionId,
        activeReferences: ws.activeReferences,
        readingHistory: ws.readingHistory,
        researchNotebook: ws.researchNotebook,
        totalTokens: ws.totalTokens,
    };
}
