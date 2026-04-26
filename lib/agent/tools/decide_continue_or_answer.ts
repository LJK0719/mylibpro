import { Type } from "@google/genai";
import { addArtifact, getOrCreateSession } from "../workspace";

export const decideContinueOrAnswerDeclaration = {
    name: "decide_continue_or_answer",
    description:
        "Record the research decision after at least one evidence unit has been read and notes have been updated. Use this to decide whether to search_more, read_more, or answer.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            decision: {
                type: Type.STRING,
                enum: ["search_more", "read_more", "answer"],
                description: "Next action for the research workflow.",
            },
            reason: {
                type: Type.STRING,
                description:
                    "Why the current evidence is sufficient or what is missing.",
            },
            needed_document_type: {
                type: Type.STRING,
                enum: ["book", "paper", "any"],
                description:
                    "Optional document type needed if decision is search_more or read_more.",
            },
            missing_evidence: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                    "Evidence gaps that still need reading before answering.",
            },
        },
        required: ["decision", "reason"],
    },
};

export function executeDecideContinueOrAnswer(
    args: Record<string, unknown>,
    sessionId: string
): Record<string, unknown> {
    const decision = (args.decision as string) || "read_more";
    const reason = (args.reason as string) || "";
    const missingEvidence = Array.isArray(args.missing_evidence)
        ? args.missing_evidence
        : [];
    const neededDocumentType = (args.needed_document_type as string) || "any";
    const ws = getOrCreateSession(sessionId);

    if (ws.readingHistory.length === 0 && decision !== "answer") {
        return {
            error:
                "Cannot decide to read_more or search_more before a paper or book chapter has been read and recorded.",
            decision,
            reason,
        };
    }

    if (!ws.researchNotebook.trim() && decision !== "answer") {
        return {
            error:
                "Cannot decide to read_more or search_more before update_research_notes has captured the reading evidence.",
            decision,
            reason,
        };
    }

    addArtifact(sessionId, {
        type: "evidence_summary",
        title: `Decision: ${decision}`,
        contentMarkdown: [
            `Decision: ${decision}`,
            `Reason: ${reason}`,
            `Needed document type: ${neededDocumentType}`,
            missingEvidence.length > 0
                ? `Missing evidence:\n${missingEvidence.map((item) => `- ${item}`).join("\n")}`
                : "Missing evidence: none",
        ].join("\n\n"),
        sourceDocumentIds: Array.from(
            new Set(ws.readingHistory.map((entry) => entry.documentId))
        ),
    });

    return {
        success: true,
        decision,
        reason,
        needed_document_type: neededDocumentType,
        missing_evidence: missingEvidence,
        can_answer: decision === "answer",
        instruction:
            decision === "answer"
                ? "Evidence is sufficient. Produce the final answer using only recorded readings and notebook evidence."
                : "Continue the research loop before answering.",
    };
}
