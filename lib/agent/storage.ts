/**
 * Client-side chat persistence.
 *
 * Stores a list of conversations + the active conversation id in
 * `localStorage` so chat history survives page refreshes.
 *
 * Layout:
 *   localStorage["libpro:agent:conversations"]  → ChatConversation[] (newest first)
 *   localStorage["libpro:agent:activeId"]       → string | null
 *   localStorage["libpro:agent:settings"]       → ChatSettings
 */

import type { Message } from "@/lib/types/chat";

export interface ChatSettings {
    provider: "gemini" | "openai";
    apiKey: string;
    model: string;
    baseUrl: string;
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
const MAX_CONVERSATIONS = 50;
const MAX_TITLE_LENGTH = 40;

function isBrowser(): boolean {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
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
    return safeParse<Partial<ChatSettings>>(localStorage.getItem(KEY_SETTINGS), {});
}

export function saveSettings(settings: ChatSettings): void {
    if (!isBrowser()) return;
    // Don't persist API key for safety.
    const { apiKey: _omit, ...rest } = settings;
    void _omit;
    try {
        localStorage.setItem(KEY_SETTINGS, JSON.stringify(rest));
    } catch {
        // storage full / disabled — silently ignore
    }
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
