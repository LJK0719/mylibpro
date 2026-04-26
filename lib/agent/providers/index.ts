/**
 * Provider barrel — public entry point for agent provider adapters.
 *
 * The chat route imports config resolution and provider call helpers
 * from here. Per-provider SDK details stay in the sibling files.
 */

export * from "./types";
export {
    normalizeProvider,
    envProvider,
    normalizeOpenAIBaseUrl,
    resolveAgentConfig,
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
