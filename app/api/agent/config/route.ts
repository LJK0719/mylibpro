import { NextResponse } from "next/server";

type AgentProvider = "gemini" | "openai";

function normalizeProvider(provider?: string): AgentProvider {
    return provider === "openai" || provider === "openai-compatible"
        ? "openai"
        : "gemini";
}

function envProvider(): AgentProvider {
    const configured = process.env.AGENT_PROVIDER || process.env.LLM_PROVIDER;
    if (configured) return normalizeProvider(configured);
    return "gemini";
}

function normalizeOpenAIBaseUrl(baseUrl: string): string {
    const trimmed = baseUrl.trim().replace(/\/+$/, "");
    if (!trimmed) return "https://api.openai.com/v1";
    return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

export async function GET() {
    const provider = envProvider();

    if (provider === "openai") {
        const baseUrl = normalizeOpenAIBaseUrl(
            process.env.NEWAPI_BASE_URL ||
            process.env.OPENAI_BASE_URL ||
            process.env.LLM_BASE_URL ||
            "https://api.openai.com/v1"
        );

        return NextResponse.json({
            provider,
            model:
                process.env.NEWAPI_MODEL ||
                process.env.OPENAI_MODEL ||
                process.env.LLM_MODEL ||
                "gpt-4.1-mini",
            baseUrl,
            hasApiKey: Boolean(
                process.env.NEWAPI_API_KEY ||
                process.env.OPENAI_API_KEY ||
                process.env.LLM_API_KEY
            ),
            contextCache: {
                enabled: process.env.AGENT_CONTEXT_CACHE_ENABLED === "true",
                retention:
                    process.env.AGENT_CONTEXT_CACHE_RETENTION === "24h"
                        ? "24h"
                        : "in_memory",
            },
        });
    }

    return NextResponse.json({
        provider,
        model:
            process.env.GEMINI_MODEL ||
            process.env.LLM_MODEL ||
            "gemini-3.1-flash-lite-preview",
        baseUrl: "",
        hasApiKey: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
        contextCache: {
            enabled: process.env.AGENT_CONTEXT_CACHE_ENABLED === "true",
            retention: "in_memory",
        },
    });
}
