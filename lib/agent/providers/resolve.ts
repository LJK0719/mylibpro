/**
 * Resolve agent configuration from request body + environment variables.
 *
 * Per-request input takes precedence over env. Env access goes through
 * `lib/config.ts` so the precedence rules stay centralized.
 */

import { agentEnv } from "../../config";
import type { AgentConfig, AgentProvider } from "./types";

export function normalizeProvider(provider?: string): AgentProvider {
    return provider === "openai" || provider === "openai-compatible"
        ? "openai"
        : "gemini";
}

export function envProvider(): AgentProvider {
    const configured = agentEnv.provider;
    if (configured) return normalizeProvider(configured);
    return "gemini";
}

export function normalizeOpenAIBaseUrl(baseUrl: string): string {
    const trimmed = baseUrl.trim().replace(/\/+$/, "");
    if (!trimmed) return "https://api.openai.com/v1";
    return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

export function resolveAgentConfig(input: {
    provider?: string;
    apiKey?: string;
    model?: string;
    baseUrl?: string;
}): AgentConfig {
    const provider = normalizeProvider(input.provider || envProvider());

    if (provider === "openai") {
        const rawBaseUrl =
            input.baseUrl?.trim() ||
            agentEnv.openaiBaseUrl ||
            "https://api.openai.com/v1";
        const baseUrl = normalizeOpenAIBaseUrl(rawBaseUrl);

        return {
            provider,
            apiKey:
                input.apiKey?.trim() ||
                agentEnv.openaiApiKey ||
                "",
            model:
                input.model?.trim() ||
                agentEnv.openaiModel ||
                "gpt-4.1-mini",
            baseUrl,
            contextCache: {
                enabled: agentEnv.contextCacheEnabled,
                retention: agentEnv.contextCacheRetention,
                keyPrefix:
                    agentEnv.contextCacheKeyPrefix ||
                    "mylibpro-research-agent",
            },
        };
    }

    return {
        provider,
        apiKey:
            input.apiKey?.trim() ||
            agentEnv.geminiApiKey ||
            "",
        model:
            input.model?.trim() ||
            agentEnv.geminiModel ||
            "gemini-3.1-flash-lite-preview",
        baseUrl: "",
        contextCache: {
            enabled: agentEnv.contextCacheEnabled,
            retention: "in_memory",
            keyPrefix: "mylibpro-research-agent",
        },
    };
}
