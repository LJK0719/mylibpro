import { NextResponse } from "next/server";
import { resolveAgentConfig, resolveAllProviders } from "@/lib/agent/providers";

/**
 * GET /api/agent/config
 *
 * Returns per-provider key availability + env-derived defaults so the
 * client model picker can show "server key ready" vs "needs your key"
 * for each provider. The API key values themselves are never returned.
 */
export async function GET() {
    const { defaultProvider, providers } = resolveAllProviders();
    // contextCache is provider-independent; read it once.
    const { contextCache } = resolveAgentConfig({});

    return NextResponse.json({
        defaultProvider,
        providers,
        contextCache,
    });
}
