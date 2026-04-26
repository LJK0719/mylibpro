/**
 * Shared chat / agent UI types.
 *
 * Defined here (instead of inside the React component file) so that
 * non-UI modules (e.g. lib/chat-storage.ts) can depend on the shape
 * without importing from the components layer.
 */

export interface ToolCall {
    name: string;
    args: Record<string, unknown>;
    status: "running" | "done" | "error";
}

export interface Message {
    id: string;
    role: "user" | "agent";
    content: string;
    timestamp: string;
    toolCalls?: ToolCall[];
}
