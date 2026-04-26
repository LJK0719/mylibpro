/**
 * OpenAI-compatible provider adapter.
 *
 * Translates Gemini-style FunctionDeclarations into OpenAI tool schemas
 * and issues `chat.completions` requests with optional prompt-cache hints.
 */

import type { FunctionDeclaration } from "@google/genai";
import type { AgentConfig, OpenAIMessage, OpenAIToolCall } from "./types";

function toJsonSchema(schema: Record<string, unknown>): Record<string, unknown> {
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

export function toOpenAITools(tools: FunctionDeclaration[]) {
    return tools.map((tool) => {
        const declaration = tool as unknown as {
            name: string;
            description?: string;
            parameters?: Record<string, unknown>;
        };
        return {
            type: "function" as const,
            function: {
                name: declaration.name,
                description: declaration.description || "",
                parameters: declaration.parameters
                    ? toJsonSchema(declaration.parameters)
                    : { type: "object", properties: {} },
            },
        };
    });
}

export async function callOpenAICompatible(input: {
    config: AgentConfig;
    system: string;
    messages: OpenAIMessage[];
    tools: FunctionDeclaration[];
    sessionId: string;
}): Promise<{ text: string; toolCalls: OpenAIToolCall[]; assistantMessage: OpenAIMessage }> {
    const requestBody: Record<string, unknown> = {
        model: input.config.model,
        messages: [
            { role: "system", content: input.system },
            ...input.messages,
        ],
        tools: toOpenAITools(input.tools),
        tool_choice: "auto",
    };

    if (input.config.contextCache.enabled) {
        requestBody.prompt_cache_key = `${input.config.contextCache.keyPrefix}:${input.sessionId}`;
        requestBody.prompt_cache_retention = input.config.contextCache.retention;
    }

    if (!/^[\x00-\xFF]*$/.test(input.config.apiKey)) {
        throw new Error("Invalid API Key: contains non-ASCII characters. Please check your settings.");
    }
    if (!/^[\x00-\xFF]*$/.test(input.config.baseUrl)) {
        throw new Error("Invalid Base URL: contains non-ASCII characters. Please check your settings.");
    }

    const res = await fetch(`${input.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${input.config.apiKey}`,
        },
        body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`OpenAI-compatible API error ${res.status}: ${text}`);
    }

    const data = await res.json();
    const message = data.choices?.[0]?.message;
    if (!message) {
        throw new Error("OpenAI-compatible API returned no message");
    }

    const toolCalls: OpenAIToolCall[] = (message.tool_calls || [])
        .map((tc: {
            id?: string;
            function?: { name?: string; arguments?: string };
        }) => {
            let args: Record<string, unknown> = {};
            try {
                args = JSON.parse(tc.function?.arguments || "{}");
            } catch {
                args = {};
            }
            return {
                id: tc.id || `call-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                name: tc.function?.name || "",
                args,
            };
        })
        .filter((tc: OpenAIToolCall) => tc.name);

    return {
        text: typeof message.content === "string" ? message.content : "",
        toolCalls,
        assistantMessage: {
            role: "assistant",
            content: message.content || null,
            tool_calls: message.tool_calls || undefined,
        },
    };
}
