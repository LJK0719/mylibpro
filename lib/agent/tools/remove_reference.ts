import { Type } from "@google/genai";
import { getOrCreateSession, removeActiveReference } from "../workspace";

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
            chapter_file_name: {
                type: Type.STRING,
                description:
                    "Chapter file name when removing a book chapter reference.",
            },
            key_findings: {
                type: Type.STRING,
                description:
                    "Key findings preserved before releasing the active full-text context.",
            },
        },
        required: ["document_id", "reason", "key_findings"],
    },
};

export function executeRemoveReference(
    args: Record<string, unknown>,
    sessionId: string
): Record<string, unknown> {
    const documentId = args.document_id as string;
    const reason = args.reason as string;
    const keyFindings = (args.key_findings as string) || "";
    const chapterFileName = args.chapter_file_name as string | undefined;

    const ws = getOrCreateSession(sessionId);
    const ref = ws.activeReferences.find(
        (r) =>
            r.documentId === documentId &&
            (!chapterFileName || r.chapterFileName === chapterFileName)
    );

    if (!ref) {
        return {
            error: `Document ${documentId} not found in active references.`,
        };
    }

    removeActiveReference(sessionId, documentId, reason, keyFindings, chapterFileName);

    return {
        success: true,
        document_id: documentId,
        title: ref.title,
        chapter_file_name: ref.chapterFileName,
        message: `Removed "${ref.title}" from Active References. Reading history and artifacts are preserved.`,
        reason,
        key_findings: keyFindings,
        usefulness: ref.usefulness,
        active_references_count: ws.activeReferences.length,
        total_tokens: ws.totalTokens,
    };
}
