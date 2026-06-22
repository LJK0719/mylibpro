/**
 * Client-side chat persistence.
 *
 * Stores a list of conversations + the active conversation id in
 * `localStorage` so chat history survives page refreshes.
 *
 * Layout:
 *   localStorage["libpro:agent:conversations"]  → ChatConversation[] (newest first)
 *   localStorage["libpro:agent:activeId"]       → string | null
 *   localStorage["libpro:agent:settings"]       → ChatSettings (NO api keys)
 *   sessionStorage["libpro:agent:apikeys"]      → Record<provider, string>
 *
 * Security: API keys are NEVER written to localStorage. They live only in
 * sessionStorage (cleared when the tab closes) so a non-default provider's
 * key survives refresh within the session without long-term persistence.
 */

import type { Message } from "@/lib/types/chat";
import type { AgentProvider } from "@/lib/agent/providers/types";

/**
 * Non-secret chat settings. Model / base URL are remembered *per provider*
 * so switching providers restores the last-used model for each.
 */
export interface ChatSettings {
    provider: AgentProvider;
    models: Partial<Record<AgentProvider, string>>;
    baseUrls: Partial<Record<AgentProvider, string>>;
}

/** Legacy flat shape persisted by earlier versions; migrated on read. */
interface LegacyChatSettings {
    provider?: AgentProvider;
    model?: string;
    baseUrl?: string;
}

export interface ChatConversation {
    id: string;             // matches the agent sessionId
    title: string;
    createdAt: string;      // ISO
    updatedAt: string;      // ISO
    messages: Message[];
    /** Optional snapshot of the workspace state at last update. */
    workspace?: unknown | null;
}

const KEY_LIST = "libpro:agent:conversations";
const KEY_ACTIVE = "libpro:agent:activeId";
const KEY_SETTINGS = "libpro:agent:settings";
const KEY_APIKEYS = "libpro:agent:apikeys";
const MAX_CONVERSATIONS = 50;
const MAX_TITLE_LENGTH = 40;

function isBrowser(): boolean {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function hasSessionStorage(): boolean {
    return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function safeParse<T>(raw: string | null, fallback: T): T {
    if (!raw) return fallback;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

export function loadConversations(): ChatConversation[] {
    if (!isBrowser()) return [];
    return safeParse<ChatConversation[]>(localStorage.getItem(KEY_LIST), []);
}

export function loadActiveId(): string | null {
    if (!isBrowser()) return null;
    return localStorage.getItem(KEY_ACTIVE);
}

export function saveActiveId(id: string | null): void {
    if (!isBrowser()) return;
    if (id) localStorage.setItem(KEY_ACTIVE, id);
    else localStorage.removeItem(KEY_ACTIVE);
}

export function loadSettings(): Partial<ChatSettings> {
    if (!isBrowser()) return {};
    const raw = safeParse<Partial<ChatSettings> & LegacyChatSettings>(
        localStorage.getItem(KEY_SETTINGS),
        {}
    );

    // Migrate the legacy flat { provider, model, baseUrl } shape.
    if (raw && (raw.model !== undefined || raw.baseUrl !== undefined) && !raw.models) {
        const provider = raw.provider;
        return {
            provider,
            models: provider && raw.model ? { [provider]: raw.model } : {},
            baseUrls: provider && raw.baseUrl ? { [provider]: raw.baseUrl } : {},
        };
    }

    return {
        provider: raw.provider,
        models: raw.models || {},
        baseUrls: raw.baseUrls || {},
    };
}

/** Persist non-secret settings. API keys are intentionally never written here. */
export function saveSettings(settings: ChatSettings): void {
    if (!isBrowser()) return;
    const payload = {
        provider: settings.provider,
        models: settings.models || {},
        baseUrls: settings.baseUrls || {},
    };
    try {
        localStorage.setItem(KEY_SETTINGS, JSON.stringify(payload));
    } catch {
        // storage full / disabled — silently ignore
    }
}

// ─── Per-provider API keys (sessionStorage only) ────────────────────

/** Load all session-scoped API keys keyed by provider. */
export function loadSessionApiKeys(): Partial<Record<AgentProvider, string>> {
    if (!hasSessionStorage()) return {};
    try {
        return safeParse<Partial<Record<AgentProvider, string>>>(
            sessionStorage.getItem(KEY_APIKEYS),
            {}
        );
    } catch {
        return {};
    }
}

/** Save (or clear, when empty) a provider's API key for this browser session. */
export function saveSessionApiKey(provider: AgentProvider, key: string): void {
    if (!hasSessionStorage()) return;
    const all = loadSessionApiKeys();
    const trimmed = key.trim();
    if (trimmed) all[provider] = trimmed;
    else delete all[provider];
    try {
        sessionStorage.setItem(KEY_APIKEYS, JSON.stringify(all));
    } catch {
        // session storage full / disabled — silently ignore
    }
}

export function clearSessionApiKey(provider: AgentProvider): void {
    saveSessionApiKey(provider, "");
}

function deriveTitle(messages: Message[]): string {
    const firstUser = messages.find((m) => m.role === "user" && m.content);
    const text = firstUser?.content?.trim() || "新对话";
    return text.length > MAX_TITLE_LENGTH
        ? text.slice(0, MAX_TITLE_LENGTH) + "…"
        : text;
}

/**
 * Upsert a conversation snapshot. If `messages` is empty the
 * conversation is removed from the list (so empty placeholders
 * don't leak into history).
 */
export function upsertConversation(conv: {
    id: string;
    messages: Message[];
    workspace?: unknown | null;
}): void {
    if (!isBrowser()) return;
    const list = loadConversations();
    const idx = list.findIndex((c) => c.id === conv.id);
    const now = new Date().toISOString();

    if (conv.messages.length === 0) {
        if (idx >= 0) {
            list.splice(idx, 1);
            try { localStorage.setItem(KEY_LIST, JSON.stringify(list)); } catch { /* ignore */ }
        }
        return;
    }

    const next: ChatConversation = {
        id: conv.id,
        title: idx >= 0 && list[idx].title && list[idx].title !== "新对话"
            ? list[idx].title
            : deriveTitle(conv.messages),
        createdAt: idx >= 0 ? list[idx].createdAt : now,
        updatedAt: now,
        messages: conv.messages,
        workspace: conv.workspace ?? null,
    };

    if (idx >= 0) list.splice(idx, 1);
    list.unshift(next);
    if (list.length > MAX_CONVERSATIONS) list.length = MAX_CONVERSATIONS;

    try {
        localStorage.setItem(KEY_LIST, JSON.stringify(list));
    } catch {
        // If quota exceeded, drop oldest items and retry once.
        while (list.length > 1) {
            list.pop();
            try {
                localStorage.setItem(KEY_LIST, JSON.stringify(list));
                return;
            } catch { /* keep dropping */ }
        }
    }
}

export function deleteConversation(id: string): void {
    if (!isBrowser()) return;
    const list = loadConversations().filter((c) => c.id !== id);
    try { localStorage.setItem(KEY_LIST, JSON.stringify(list)); } catch { /* ignore */ }
    if (loadActiveId() === id) saveActiveId(null);
}

export function clearAllConversations(): void {
    if (!isBrowser()) return;
    localStorage.removeItem(KEY_LIST);
    localStorage.removeItem(KEY_ACTIVE);
}

export function renameConversation(id: string, title: string): void {
    if (!isBrowser()) return;
    const list = loadConversations();
    const idx = list.findIndex((c) => c.id === id);
    if (idx < 0) return;
    list[idx] = { ...list[idx], title: title.trim() || list[idx].title };
    try { localStorage.setItem(KEY_LIST, JSON.stringify(list)); } catch { /* ignore */ }
}
