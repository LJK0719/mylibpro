/**
 * Centralized environment-variable access.
 *
 * All `process.env.*` reads in the runtime app code go through this
 * module. Keep the surface small and *behaviour preserving*: each
 * helper here must produce the exact same value as the original
 * inline read it replaces.
 *
 * Note: scripts/ may keep its own inline reads if it needs a different
 * working-directory base (e.g. PROJECT_ROOT vs process.cwd()).
 */

import path from "path";
import fs from "fs";

// ─── Filesystem roots ───────────────────────────────────────────────

/**
 * Absolute path to the Markdown / data root.
 * Default: `<cwd>/../data` (sibling of the project).
 */
export function getDataRoot(): string {
    return process.env.DATA_ROOT
        ? path.resolve(process.cwd(), process.env.DATA_ROOT)
        : fs.existsSync("D:\\bookdata\\libdata")
            ? "D:\\bookdata\\libdata"
        : path.resolve(process.cwd(), "..", "data");
}

/**
 * Absolute path to the SQLite database file.
 * Default: `<cwd>/db/library.db`.
 */
export function getDbPath(): string {
    return process.env.DB_PATH
        ? path.resolve(process.cwd(), process.env.DB_PATH)
        : path.join(process.cwd(), "db", "library.db");
}

// ─── Agent / LLM ────────────────────────────────────────────────────
// Raw env passthroughs used by the agent provider resolution logic.
// The precedence rules themselves live in app/api/agent/chat/route.ts
// (and will move to lib/agent/providers in a later refactor batch).

export const agentEnv = {
    get provider(): string | undefined {
        return process.env.AGENT_PROVIDER || process.env.LLM_PROVIDER || undefined;
    },

    // Gemini
    get geminiApiKey(): string | undefined {
        return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || undefined;
    },
    get geminiModel(): string | undefined {
        return process.env.GEMINI_MODEL || process.env.LLM_MODEL || undefined;
    },

    // OpenAI-compatible (NEWAPI_* / OPENAI_* / LLM_*)
    get openaiBaseUrl(): string | undefined {
        return (
            process.env.NEWAPI_BASE_URL ||
            process.env.OPENAI_BASE_URL ||
            process.env.LLM_BASE_URL ||
            undefined
        );
    },
    get openaiApiKey(): string | undefined {
        return (
            process.env.NEWAPI_API_KEY ||
            process.env.OPENAI_API_KEY ||
            process.env.LLM_API_KEY ||
            undefined
        );
    },
    get openaiModel(): string | undefined {
        return (
            process.env.NEWAPI_MODEL ||
            process.env.OPENAI_MODEL ||
            process.env.LLM_MODEL ||
            undefined
        );
    },

    // Context cache
    get contextCacheEnabled(): boolean {
        return process.env.AGENT_CONTEXT_CACHE_ENABLED === "true";
    },
    get contextCacheRetention(): "in_memory" | "24h" {
        return process.env.AGENT_CONTEXT_CACHE_RETENTION === "24h"
            ? "24h"
            : "in_memory";
    },
    get contextCacheKeyPrefix(): string | undefined {
        return process.env.AGENT_CONTEXT_CACHE_KEY_PREFIX || undefined;
    },
};
