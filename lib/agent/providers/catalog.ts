/**
 * Shared provider catalog — the single source of truth for the model
 * picker UI and the client-side defaults.
 *
 * This module is **client-safe**: it must NOT import anything that reads
 * `process.env` or touches the filesystem. The server resolves real env
 * keys via `lib/agent/providers/resolve.ts`; this file only describes the
 * provider lineup (labels, suggested models, base URLs, help links) so the
 * front end can render a consistent picker and pick sensible defaults.
 *
 * Model lists are *suggestions*, not an exhaustive allow-list. The picker
 * always allows a free-text custom model so new releases work without a
 * code change. Keep the default model in sync with `.env.example`.
 */

import type { AgentProvider } from "./types";

export interface ProviderModel {
    /** Exact API model id sent to the provider. */
    id: string;
    /** Human-friendly label shown in the dropdown. */
    label: string;
    /** Optional short note (e.g. "legacy", "fast"). */
    note?: string;
}

export interface ProviderMeta {
    id: AgentProvider;
    label: string;
    /** Default model id used when nothing is stored yet. */
    defaultModel: string;
    /** Suggested models (the dropdown also offers a custom option). */
    models: ProviderModel[];
    /** Default base URL (for display / placeholder). Empty when N/A (Gemini). */
    defaultBaseUrl: string;
    /** Whether the base URL is meaningfully user-editable (OpenAI-compatible). */
    baseUrlEditable: boolean;
    /** Where the user obtains an API key. */
    apiKeyUrl: string;
    /** Primary env var name, surfaced in "needs key" help text. */
    apiKeyEnvHint: string;
}

/** Render / iteration order. DeepSeek first — it is the default provider. */
export const PROVIDER_ORDER: AgentProvider[] = ["deepseek", "gemini", "openai", "claude"];

export const PROVIDER_CATALOG: Record<AgentProvider, ProviderMeta> = {
    deepseek: {
        id: "deepseek",
        label: "DeepSeek",
        // Verified against api-docs.deepseek.com (DeepSeek V4 Preview, 2026-04-24):
        // exact ids are `deepseek-v4-pro` / `deepseek-v4-flash`. The legacy
        // `deepseek-chat` / `deepseek-reasoner` ids still route to v4-flash but
        // are scheduled to retire after 2026-07-24.
        defaultModel: "deepseek-v4-pro",
        models: [
            { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro", note: "旗舰 · 1M" },
            { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash", note: "快 / 省 · 1M" },
            { id: "deepseek-chat", label: "deepseek-chat", note: "旧 · 2026-07 停用" },
            { id: "deepseek-reasoner", label: "deepseek-reasoner", note: "旧 · 2026-07 停用" },
        ],
        defaultBaseUrl: "https://api.deepseek.com",
        baseUrlEditable: false,
        apiKeyUrl: "https://platform.deepseek.com/api_keys",
        apiKeyEnvHint: "DEEPSEEK_API_KEY",
    },
    gemini: {
        id: "gemini",
        label: "Gemini",
        defaultModel: "gemini-3.1-flash-lite-preview",
        models: [
            { id: "gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash Lite", note: "preview" },
            { id: "gemini-3.1-flash-preview", label: "Gemini 3.1 Flash", note: "preview" },
            { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
            { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
        ],
        defaultBaseUrl: "",
        baseUrlEditable: false,
        apiKeyUrl: "https://aistudio.google.com/app/apikey",
        apiKeyEnvHint: "GEMINI_API_KEY",
    },
    openai: {
        id: "openai",
        label: "OpenAI 兼容",
        defaultModel: "gpt-4.1-mini",
        models: [
            { id: "gpt-4.1-mini", label: "gpt-4.1-mini" },
            { id: "gpt-4.1", label: "gpt-4.1" },
            { id: "gpt-4o-mini", label: "gpt-4o-mini" },
            { id: "gpt-4o", label: "gpt-4o" },
        ],
        defaultBaseUrl: "https://api.openai.com/v1",
        baseUrlEditable: true,
        apiKeyUrl: "https://platform.openai.com/api-keys",
        apiKeyEnvHint: "OPENAI_API_KEY",
    },
    claude: {
        id: "claude",
        label: "Claude",
        defaultModel: "claude-sonnet-4-6",
        models: [
            { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
            { id: "claude-opus-4-8", label: "Claude Opus 4.8" },
            { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
        ],
        defaultBaseUrl: "https://api.anthropic.com",
        baseUrlEditable: false,
        apiKeyUrl: "https://console.anthropic.com/settings/keys",
        apiKeyEnvHint: "CLAUDE_API_KEY",
    },
};

/** Normalize an arbitrary string to a known provider, defaulting to deepseek. */
export function asProvider(value: string | undefined | null): AgentProvider {
    const p = (value || "").toLowerCase().trim();
    if (p === "gemini") return "gemini";
    if (p === "openai" || p === "openai-compatible") return "openai";
    if (p === "claude" || p === "anthropic") return "claude";
    return "deepseek";
}
