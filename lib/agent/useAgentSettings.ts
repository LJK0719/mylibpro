"use client";

/**
 * useAgentSettings — single source of truth for the LLM model picker.
 *
 * Centralizes provider / model / base URL / API-key state and per-provider
 * server-key availability so every surface (research agent, book-detail
 * regenerate, tag translation) behaves identically:
 *
 *   - Defaults come from the shared catalog, overridden by env-derived
 *     defaults from `/api/agent/config`, overridden by the user's stored
 *     choices (localStorage, non-secret) and session keys (sessionStorage).
 *   - `ready` / `needsKey` tell the UI whether the *current* provider can be
 *     used (has a server key OR a session key entered by the user).
 *   - `requestOverrides()` produces the exact body fields to send to the
 *     agent/regenerate/translate endpoints.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AgentProvider } from "@/lib/agent/providers/types";
import { PROVIDER_CATALOG, PROVIDER_ORDER } from "@/lib/agent/providers/catalog";
import {
    loadSettings,
    saveSettings,
    loadSessionApiKeys,
    saveSessionApiKey,
} from "@/lib/agent/storage";

export interface AgentRequestOverrides {
    provider: AgentProvider;
    model: string;
    baseUrl?: string;
    apiKey?: string;
}

export interface AgentSettings {
    hydrated: boolean;
    configLoaded: boolean;
    provider: AgentProvider;
    model: string;
    baseUrl: string;
    /** Session API key for the *current* provider ("" when none). */
    apiKey: string;
    /** Whether each provider has a server-side env key. */
    envKeys: Record<AgentProvider, boolean>;
    /** True when the current provider can be used as-is. */
    ready: boolean;
    /** True when the current provider needs the user to supply a key. */
    needsKey: boolean;
    setProvider: (provider: AgentProvider) => void;
    setModel: (model: string) => void;
    setBaseUrl: (baseUrl: string) => void;
    setApiKey: (key: string) => void;
    requestOverrides: () => AgentRequestOverrides;
}

type ProviderMap = Partial<Record<AgentProvider, string>>;

const EMPTY_ENV_KEYS: Record<AgentProvider, boolean> = {
    deepseek: false,
    gemini: false,
    openai: false,
    claude: false,
};

export function useAgentSettings(): AgentSettings {
    const [hydrated, setHydrated] = useState(false);
    const [configLoaded, setConfigLoaded] = useState(false);

    const [provider, setProviderState] = useState<AgentProvider>("deepseek");
    // User overrides (persisted, non-secret).
    const [models, setModels] = useState<ProviderMap>({});
    const [baseUrls, setBaseUrls] = useState<ProviderMap>({});
    // Env-derived defaults from /api/agent/config.
    const [envModels, setEnvModels] = useState<ProviderMap>({});
    const [envBaseUrls, setEnvBaseUrls] = useState<ProviderMap>({});
    const [envKeys, setEnvKeys] = useState<Record<AgentProvider, boolean>>(EMPTY_ENV_KEYS);
    // Session API keys per provider (sessionStorage only).
    const [apiKeys, setApiKeys] = useState<ProviderMap>({});

    // ─── Hydrate from storage after mount (avoids SSR mismatch) ──────
    // SSR-safe pattern: render deterministic defaults, then sync the real
    // client-only values from storage. This necessarily setState()s inside
    // the effect, so the cascading-render rule is scoped-off here.
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        const stored = loadSettings();
        if (stored.provider) setProviderState(stored.provider);
        if (stored.models) setModels(stored.models);
        if (stored.baseUrls) setBaseUrls(stored.baseUrls);
        setApiKeys(loadSessionApiKeys());
        setHydrated(true);
    }, []);
    /* eslint-enable react-hooks/set-state-in-effect */

    // ─── Fetch per-provider env defaults + key availability ──────────
    useEffect(() => {
        let cancelled = false;
        fetch("/api/agent/config")
            .then((r) => r.json())
            .then((config: {
                defaultProvider?: AgentProvider;
                providers?: Record<AgentProvider, { hasEnvKey: boolean; model: string; baseUrl: string }>;
            }) => {
                if (cancelled || !config.providers) return;
                const nextEnvModels: ProviderMap = {};
                const nextEnvBaseUrls: ProviderMap = {};
                const nextEnvKeys = { ...EMPTY_ENV_KEYS };
                for (const p of PROVIDER_ORDER) {
                    const info = config.providers[p];
                    if (!info) continue;
                    nextEnvKeys[p] = Boolean(info.hasEnvKey);
                    if (info.model) nextEnvModels[p] = info.model;
                    if (info.baseUrl) nextEnvBaseUrls[p] = info.baseUrl;
                }
                setEnvModels(nextEnvModels);
                setEnvBaseUrls(nextEnvBaseUrls);
                setEnvKeys(nextEnvKeys);
                setConfigLoaded(true);
            })
            .catch(() => {
                if (!cancelled) setConfigLoaded(true);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // ─── Persist non-secret settings on change ───────────────────────
    useEffect(() => {
        if (!hydrated) return;
        saveSettings({ provider, models, baseUrls });
    }, [hydrated, provider, models, baseUrls]);

    // ─── Resolved values for the current provider ────────────────────
    const model =
        models[provider] || envModels[provider] || PROVIDER_CATALOG[provider].defaultModel;
    const baseUrl =
        baseUrls[provider] || envBaseUrls[provider] || PROVIDER_CATALOG[provider].defaultBaseUrl;
    const apiKey = apiKeys[provider] || "";

    const ready = envKeys[provider] || Boolean(apiKey.trim());
    // Don't flag "needs key" until we know the server-side availability.
    const needsKey = configLoaded && !ready;

    // ─── Setters ─────────────────────────────────────────────────────
    const setProvider = useCallback((next: AgentProvider) => setProviderState(next), []);

    const setModel = useCallback(
        (next: string) => setModels((prev) => ({ ...prev, [provider]: next })),
        [provider]
    );

    const setBaseUrl = useCallback(
        (next: string) => setBaseUrls((prev) => ({ ...prev, [provider]: next })),
        [provider]
    );

    const setApiKey = useCallback(
        (key: string) => {
            setApiKeys((prev) => {
                const next = { ...prev };
                if (key.trim()) next[provider] = key;
                else delete next[provider];
                return next;
            });
            saveSessionApiKey(provider, key);
        },
        [provider]
    );

    const requestOverrides = useCallback((): AgentRequestOverrides => {
        const key = (apiKeys[provider] || "").trim();
        return {
            provider,
            model,
            // Only OpenAI-compatible needs a custom base URL on the wire; the
            // server resolves the rest from env/defaults.
            baseUrl: provider === "openai" ? baseUrl.trim() || undefined : undefined,
            apiKey: key || undefined,
        };
    }, [provider, model, baseUrl, apiKeys]);

    return useMemo(
        () => ({
            hydrated,
            configLoaded,
            provider,
            model,
            baseUrl,
            apiKey,
            envKeys,
            ready,
            needsKey,
            setProvider,
            setModel,
            setBaseUrl,
            setApiKey,
            requestOverrides,
        }),
        [
            hydrated,
            configLoaded,
            provider,
            model,
            baseUrl,
            apiKey,
            envKeys,
            ready,
            needsKey,
            setProvider,
            setModel,
            setBaseUrl,
            setApiKey,
            requestOverrides,
        ]
    );
}
