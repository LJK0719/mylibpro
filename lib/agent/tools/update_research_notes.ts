import { Type } from "@google/genai";
import { updateResearchNotebook } from "../workspace";

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
                    "Markdown research notes in English. Capture key insights, important data points, and open questions from your reading. Keep notes concise and relevant to the user's query.",
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

export function executeUpdateResearchNotes(
    args: Record<string, unknown>,
    sessionId: string
): Record<string, unknown> {
    const notes = (args.notes as string) || "";
    const mode = (args.mode as string) || "append";

    const notebook = updateResearchNotebook(
        sessionId,
        notes,
        mode === "replace" ? "replace" : "append"
    );

    return {
        success: true,
        message: `Research notebook ${mode === "replace" ? "replaced" : "updated"}.`,
        notebook_length: notebook.length,
    };
}
