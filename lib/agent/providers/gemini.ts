/**
 * Gemini provider adapter.
 *
 * Thin wrapper around `@google/genai` `generateContent` that pins the
 * thinking level and packages tool declarations the way the SDK expects.
 * The chat loop owns retry / response parsing because Gemini's
 * function-call protocol is structurally different from OpenAI.
 */

import {
    GoogleGenAI,
    type FunctionDeclaration,
    type ThinkingLevel,
} from "@google/genai";

export function createGeminiClient(apiKey: string): GoogleGenAI {
    return new GoogleGenAI({ apiKey });
}

export interface GeminiCallInput {
    ai: GoogleGenAI;
    model: string;
    contents: Array<{ role: string; parts: Array<{ text: string }> }>;
    systemInstruction: string;
    tools: FunctionDeclaration[];
}

export function callGemini(input: GeminiCallInput) {
    return input.ai.models.generateContent({
        model: input.model,
        contents: input.contents,
        config: {
            systemInstruction: input.systemInstruction,
            tools: [{ functionDeclarations: input.tools }],
            thinkingConfig: {
                thinkingLevel: "high" as ThinkingLevel,
            },
        },
    });
}
