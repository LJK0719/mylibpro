/**
 * Shared schema conversion — Gemini FunctionDeclaration types → JSON Schema.
 *
 * Used by both the OpenAI-compatible and Claude adapters.
 */

import type { FunctionDeclaration } from "@google/genai";

export function toJsonSchema(schema: Record<string, unknown>): Record<string, unknown> {
    const typeMap: Record<string, string> = {
        OBJECT: "object",
        STRING: "string",
        INTEGER: "integer",
        NUMBER: "number",
        BOOLEAN: "boolean",
        ARRAY: "array",
    };

    const converted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema)) {
        if (key === "type" && typeof value === "string") {
            converted.type = typeMap[value] || value.toLowerCase();
        } else if (key === "properties" && value && typeof value === "object") {
            converted.properties = Object.fromEntries(
                Object.entries(value as Record<string, Record<string, unknown>>).map(
                    ([propKey, propValue]) => [propKey, toJsonSchema(propValue)]
                )
            );
        } else if (key === "items" && value && typeof value === "object") {
            converted.items = toJsonSchema(value as Record<string, unknown>);
        } else {
            converted[key] = value;
        }
    }
    return converted;
}

export function toClaudeTools(tools: FunctionDeclaration[]) {
    return tools.map((tool) => {
        const declaration = tool as unknown as {
            name: string;
            description?: string;
            parameters?: Record<string, unknown>;
        };
        return {
            name: declaration.name,
            description: declaration.description || "",
            input_schema: declaration.parameters
                ? toJsonSchema(declaration.parameters)
                : { type: "object", properties: {} },
        };
    });
}
