import { Type } from "@google/genai";
import {
    addArtifact,
    appendReadingHistory,
    getOrCreateSession,
    type Usefulness,
} from "../workspace";

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
                    "A concise English summary of the key findings extracted from this document, relevant to the user's question (max 500 chars).",
            },
            reading_purpose: {
                type: Type.STRING,
                description: "Why you read this document.",
            },
            citation_used: {
                type: Type.BOOLEAN,
                description: "Whether you will cite this document in your final answer.",
            },
            chapter_file_name: {
                type: Type.STRING,
                description:
                    "Required when the reading was a book chapter loaded with load_chapter.",
            },
            usefulness: {
                type: Type.STRING,
                enum: ["high", "medium", "low"],
                description:
                    "How useful this full-text document is for the current question.",
            },
            reason_to_keep: {
                type: Type.STRING,
                description:
                    "Why this document should remain active, or why it can be removed after notes capture its value.",
            },
        },
        required: ["document_id", "key_findings", "reading_purpose"],
    },
};

export function executeRecordReading(
    args: Record<string, unknown>,
    sessionId: string
): Record<string, unknown> {
    const documentId = args.document_id as string;
    const keyFindings = args.key_findings as string;
    const readingPurpose = args.reading_purpose as string;
    const citationUsed = (args.citation_used as boolean) ?? true;
    const chapterFileName = args.chapter_file_name as string | undefined;
    const usefulness = ((args.usefulness as Usefulness) || "medium");
    const reasonToKeep =
        (args.reason_to_keep as string) ||
        "The document has findings relevant to the current research question.";

    const ws = getOrCreateSession(sessionId);
    const alreadyRecorded = ws.readingHistory.some(
        (entry) =>
            entry.documentId === documentId &&
            entry.chapterFileName === chapterFileName &&
            Boolean(entry.keyFindings)
    );
    if (alreadyRecorded) {
        return {
            error:
                "Reading findings for this evidence unit have already been recorded in this research session. Update the research notebook or decide whether to answer instead of recording a duplicate.",
            document_id: documentId,
            chapter_file_name: chapterFileName,
            already_recorded: true,
        };
    }

    const matchingRefs = ws.activeReferences.filter(
        (r) =>
            r.documentId === documentId &&
            (!chapterFileName || r.chapterFileName === chapterFileName)
    );
    const ref = matchingRefs.length === 1 ? matchingRefs[0] : undefined;

    if (!ref) {
        return {
            error:
                matchingRefs.length > 1
                    ? `Multiple active references found for ${documentId}; pass chapter_file_name.`
                    : `Document ${documentId}${chapterFileName ? ` / ${chapterFileName}` : ""} not found in active references.`,
        };
    }

    ref.usefulness = usefulness;
    ref.reasonToKeep = reasonToKeep;

    const historyEntry = appendReadingHistory(sessionId, {
        documentId: ref.documentId,
        referenceKind: ref.referenceKind,
        chapterFileName: ref.chapterFileName,
        type: ref.type,
        title: ref.title,
        readingPurpose,
        keyFindings,
        removedReason: "",
        citationUsed,
        citationInfo: ref.citationInfo,
        markdownPath: ref.fullTextPath,
        usefulness,
    });

    const artifact = addArtifact(sessionId, {
        type: "reading_note",
        title: `Reading note: ${ref.title}`,
        contentMarkdown: keyFindings,
        sourceDocumentIds: [documentId],
    });

    return {
        success: true,
        document_id: documentId,
        title: ref.title,
        reading_unit: ref.referenceKind,
        chapter_file_name: ref.chapterFileName,
        message: `Recorded reading findings for "${ref.title}".`,
        usefulness,
        reason_to_keep: reasonToKeep,
        history_id: historyEntry.historyId,
        artifact_id: artifact.artifactId,
        active_references_count: ws.activeReferences.length,
        reading_history_count: ws.readingHistory.length,
        total_tokens: ws.totalTokens,
    };
}
