/**
 * Provider barrel — public entry point for agent provider adapters.
 *
 * The chat route imports config resolution and provider call helpers
 * from here. Per-provider SDK details stay in the sibling files.
 */

export * from "./types";
export {
    PROVIDER_CATALOG,
    PROVIDER_ORDER,
    asProvider,
    type ProviderMeta,
    type ProviderModel,
} from "./catalog";
export {
    normalizeProvider,
    envProvider,
    normalizeOpenAIBaseUrl,
    resolveAgentConfig,
    resolveAllProviders,
    type ProviderAvailability,
} from "./resolve";
export {
    toOpenAITools,
    callOpenAICompatible,
} from "./openai";
export {
    createGeminiClient,
    callGemini,
    type GeminiCallInput,
} from "./gemini";
export { callClaude } from "./claude";
