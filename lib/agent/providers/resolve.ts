/**
 * Resolve agent configuration from request body + environment variables.
 *
 * Per-request input takes precedence over env. Env access goes through
 * `lib/config.ts` so the precedence rules stay centralized.
 *
 * Provider selection order:
 *   1.  Request body `provider` field
 *   2.  Environment AGENT_PROVIDER / LLM_PROVIDER
 *   3.  Default: "deepseek"
 */

import { agentEnv } from "../../config";
import type { AgentConfig, AgentProvider } from "./types";
import { PROVIDER_ORDER } from "./catalog";

export function normalizeProvider(provider?: string): AgentProvider {
    const p = (provider || "").toLowerCase().trim();
    switch (p) {
        case "gemini":
            return "gemini";
        case "openai":
        case "openai-compatible":
            return "openai";
        case "claude":
        case "anthropic":
            return "claude";
        case "deepseek":
            return "deepseek";
        default:
            return "deepseek";
    }
}

export function envProvider(): AgentProvider {
    const configured = agentEnv.provider;
    if (configured) return normalizeProvider(configured);
    return "deepseek";
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

    const contextCache = {
        enabled: agentEnv.contextCacheEnabled,
        retention: (agentEnv.contextCacheRetention || "in_memory") as "in_memory" | "24h",
        keyPrefix:
            agentEnv.contextCacheKeyPrefix ||
            "mylibpro-research-agent",
    };

    switch (provider) {
        case "openai": {
            const baseUrl = (input.baseUrl?.trim() ||
                agentEnv.openaiBaseUrl ||
                "https://api.openai.com/v1").replace(/\/+$/, "");
            return {
                provider,
                apiKey: input.apiKey?.trim() || agentEnv.openaiApiKey || "",
                model: input.model?.trim() || agentEnv.openaiModel || "gpt-4.1-mini",
                baseUrl: baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`,
                contextCache,
            };
        }
        case "claude": {
            const baseUrl = (input.baseUrl?.trim() ||
                agentEnv.claudeBaseUrl ||
                "https://api.anthropic.com").replace(/\/+$/, "");
            // The Claude adapter appends /v1/messages itself; keep base clean.
            return {
                provider,
                apiKey: input.apiKey?.trim() || agentEnv.claudeApiKey || "",
                model: input.model?.trim() || agentEnv.claudeModel || "claude-sonnet-4-6",
                baseUrl,
                contextCache,
            };
        }
        case "deepseek": {
            const baseUrl = (input.baseUrl?.trim() ||
                agentEnv.deepseekBaseUrl ||
                "https://api.deepseek.com").replace(/\/+$/, "");
            return {
                provider,
                apiKey: input.apiKey?.trim() || agentEnv.deepseekApiKey || "",
                model: input.model?.trim() || agentEnv.deepseekModel || "deepseek-chat",
                baseUrl: baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`,
                contextCache,
            };
        }
        case "gemini":
        default: {
            return {
                provider: "gemini",
                apiKey: input.apiKey?.trim() || agentEnv.geminiApiKey || "",
                model: input.model?.trim() || agentEnv.geminiModel || "gemini-3.1-flash-lite-preview",
                baseUrl: "",
                contextCache,
            };
        }
    }
}

/** Per-provider availability surfaced to the client model picker. */
export interface ProviderAvailability {
    hasEnvKey: boolean;
    model: string;
    baseUrl: string;
}

/**
 * Resolve env-derived defaults + key availability for every provider.
 *
 * Reuses `resolveAgentConfig` per provider so env precedence stays in one
 * place. The API key value itself is never returned — only whether one
 * exists server-side, plus the default model / base URL.
 */
export function resolveAllProviders(): {
    defaultProvider: AgentProvider;
    providers: Record<AgentProvider, ProviderAvailability>;
} {
    const providers = {} as Record<AgentProvider, ProviderAvailability>;
    for (const provider of PROVIDER_ORDER) {
        const config = resolveAgentConfig({ provider });
        providers[provider] = {
            hasEnvKey: Boolean(config.apiKey),
            model: config.model,
            baseUrl: config.baseUrl,
        };
    }
    return { defaultProvider: envProvider(), providers };
}
