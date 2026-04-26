/**
 * Renders the workspace state into a Markdown summary block that is
 * injected into the LLM system prompt. Pure formatting — no mutation.
 */

import { checkContextBudget, getOrCreateSession } from "./state";

export function getWorkspaceSummary(sessionId: string): string {
    const ws = getOrCreateSession(sessionId);
    const budget = checkContextBudget(ws);

    const lines: string[] = [];
    lines.push("## Current Research Workspace");
    lines.push(`Session: ${ws.session.sessionId}`);
    lines.push(`Status: ${ws.session.status}`);
    if (ws.session.userQuery) lines.push(`User query: ${ws.session.userQuery}`);
    lines.push("");

    lines.push(
        `### Active Full-Text References (${ws.activeReferences.length}, ${ws.totalTokens.toLocaleString()} tokens)`
    );
    if (ws.activeReferences.length === 0) {
        lines.push("No full-text Markdown is currently active.");
    } else {
        for (const ref of ws.activeReferences) {
            lines.push(
                `- ${ref.title}${ref.chapterFileName ? ` / ${ref.chapterFileName}` : ""} (${ref.authors.join(", ") || "Unknown"}, ${ref.year || "n.d."}) [${ref.documentId}] unit=${ref.referenceKind}; usefulness=${ref.usefulness}; keep_reason=${ref.reasonToKeep || "not set"}`
            );
        }
    }
    if (budget.message) lines.push(`Budget note: ${budget.message}`);
    lines.push("");

    lines.push(`### Reading History (${ws.readingHistory.length})`);
    if (ws.readingHistory.length === 0) {
        lines.push("No completed full-text readings yet.");
    } else {
        for (const item of ws.readingHistory.slice(-8)) {
            const detail = item.keyFindings || item.removedReason || "recorded";
            lines.push(`- ${item.title}${item.chapterFileName ? ` / ${item.chapterFileName}` : ""} [${item.documentId}]: ${detail.slice(0, 240)}`);
        }
    }
    lines.push("");

    lines.push(`### Trace Events (${ws.events.length})`);
    for (const event of ws.events.slice(-10)) {
        lines.push(
            `- ${event.type}${event.documentId ? ` [${event.documentId}]` : ""} at ${event.createdAt}`
        );
    }
    lines.push("");

    if (ws.researchNotebook) {
        lines.push("### Research Notebook");
        lines.push(ws.researchNotebook);
    } else {
        lines.push("### Research Notebook");
        lines.push("No notebook entries yet.");
    }

    return lines.join("\n");
}
