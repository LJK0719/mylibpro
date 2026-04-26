/**
 * Provider-facing types shared across Gemini and OpenAI-compatible adapters.
 */

export type AgentProvider = "gemini" | "openai";

export interface AgentConfig {
    provider: AgentProvider;
    apiKey: string;
    model: string;
    baseUrl: string;
    contextCache: {
        enabled: boolean;
        retention: "in_memory" | "24h";
        keyPrefix: string;
    };
}

/** Per-turn user / model message used by the chat loop input. */
export interface ChatMessage {
    role: "user" | "model";
    text: string;
}

/** OpenAI tool-call shape, normalized after JSON-arg parsing. */
export interface OpenAIToolCall {
    id: string;
    name: string;
    args: Record<string, unknown>;
}

/** OpenAI-compatible message envelope (system/user/assistant/tool). */
export interface OpenAIMessage {
    role: "user" | "assistant" | "tool";
    content: string | null;
    tool_call_id?: string;
    tool_calls?: Array<{
        id: string;
        type: "function";
        function: {
            name: string;
            arguments: string;
        };
    }>;
}
