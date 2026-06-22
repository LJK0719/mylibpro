/**
 * Claude / Anthropic Messages API adapter.
 *
 * Translates Gemini FunctionDeclarations → Anthropic tool format and
 * converts between OpenAI-shaped message envelopes (used by the chat
 * loop) and Anthropic's native Messages protocol so the chat route
 * stays mostly provider-agnostic.
 */

import type { FunctionDeclaration } from "@google/genai";
import { toClaudeTools } from "./schema";
import type { AgentConfig, OpenAIMessage, OpenAIToolCall } from "./types";

// ─── Types ─────────────────────────────────────────────────────────

interface AnthropicContentBlock {
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
    tool_use_id?: string;
    content?: string;
}

interface AnthropicMessage {
    role: "user" | "assistant";
    content: string | AnthropicContentBlock[];
}

// ─── OpenAI → Anthropic message conversion ─────────────────────────

function openAiToAnthropicMessages(messages: OpenAIMessage[]): AnthropicMessage[] {
    const result: AnthropicMessage[] = [];

    for (const msg of messages) {
        if (msg.role === "user") {
            // Plain user text
            result.push({ role: "user", content: msg.content || "" });
        } else if (msg.role === "assistant") {
            if (msg.tool_calls && msg.tool_calls.length > 0) {
                // Assistant message with tool calls → content blocks
                const blocks: AnthropicContentBlock[] = [];
                if (msg.content) {
                    blocks.push({ type: "text", text: msg.content });
                }
                for (const tc of msg.tool_calls) {
                    let input: Record<string, unknown> = {};
                    try {
                        input = JSON.parse(tc.function.arguments) as Record<string, unknown>;
                    } catch { /* keep empty */ }
                    blocks.push({
                        type: "tool_use",
                        id: tc.id,
                        name: tc.function.name,
                        input,
                    });
                }
                result.push({ role: "assistant", content: blocks });
            } else {
                // Plain assistant text
                result.push({ role: "assistant", content: msg.content || "" });
            }
        } else if (msg.role === "tool") {
            // Tool result → user message with tool_result block
            result.push({
                role: "user",
                content: [
                    {
                        type: "tool_result",
                        tool_use_id: msg.tool_call_id || "",
                        content: msg.content || "",
                    },
                ],
            });
        }
    }

    return result;
}

// ─── Anthropic response → OpenAI shape ─────────────────────────────

function anthropicResponseToOpenAI(
    content: AnthropicContentBlock[],
): { text: string; toolCalls: OpenAIToolCall[]; assistantMessage: OpenAIMessage } {
    let text = "";
    const toolCalls: OpenAIToolCall[] = [];

    for (const block of content) {
        if (block.type === "text" && block.text) {
            text += block.text;
        } else if (block.type === "tool_use") {
            toolCalls.push({
                id: block.id || `call-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                name: block.name || "",
                args: block.input || {},
            });
        }
    }

    const assistantMessage: OpenAIMessage = {
        role: "assistant",
        content: text || null,
        tool_calls: toolCalls.length > 0
            ? toolCalls.map((tc) => ({
                id: tc.id,
                type: "function" as const,
                function: {
                    name: tc.name,
                    arguments: JSON.stringify(tc.args),
                },
            }))
            : undefined,
    };

    return { text, toolCalls, assistantMessage };
}

// ─── Public entry point ────────────────────────────────────────────

export async function callClaude(input: {
    config: AgentConfig;
    system: string;
    messages: OpenAIMessage[];
    tools: FunctionDeclaration[];
    sessionId: string;
}): Promise<{ text: string; toolCalls: OpenAIToolCall[]; assistantMessage: OpenAIMessage }> {
    const baseUrl = input.config.baseUrl || "https://api.anthropic.com";
    const anthropicMessages = openAiToAnthropicMessages(input.messages);
    const claudeTools = toClaudeTools(input.tools);

    const requestBody: Record<string, unknown> = {
        model: input.config.model,
        max_tokens: 8192,
        system: input.system,
        messages: anthropicMessages,
        tools: claudeTools,
    };

    // Only include tools array if there are tools defined
    if (claudeTools.length === 0) {
        delete requestBody.tools;
    }

    if (!/^[\x00-\xFF]*$/.test(input.config.apiKey)) {
        throw new Error("Invalid API Key: contains non-ASCII characters.");
    }

    const res = await fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": input.config.apiKey,
            "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Claude API error ${res.status}: ${text}`);
    }

    const data = await res.json();
    const content: AnthropicContentBlock[] = data.content || [];

    return anthropicResponseToOpenAI(content);
}
