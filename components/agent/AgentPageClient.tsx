"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChatMessage, type Message } from "@/components/agent/ChatMessage";
import { ChatInput } from "@/components/agent/ChatInput";
import { WorkspacePanel } from "@/components/agent/WorkspacePanel";
import { ConversationSidebar } from "@/components/agent/ConversationSidebar";
import {
    loadConversations,
    loadActiveId,
    saveActiveId,
    upsertConversation,
    deleteConversation as deleteConv,
    clearAllConversations,
    type ChatConversation,
} from "@/lib/agent/storage";
import { useAgentSettings } from "@/lib/agent/useAgentSettings";
import { ModelSelector } from "@/components/agent/ModelSelector";
import { useLanguage } from "@/components/common/LanguageProvider";

interface WorkspaceSnapshot {
    sessionId: string;
    activeReferences: Array<{
        referenceId: string;
        documentId: string;
        referenceKind: "document" | "chapter";
        chapterFileName?: string;
        title: string;
        authors: string[];
        year: number;
        tokenCount: number;
        loadedAt: string;
        usefulness: "high" | "medium" | "low";
        reasonToKeep: string;
    }>;
    readingHistory: Array<{
        historyId: string;
        documentId: string;
        referenceKind: "document" | "chapter";
        chapterFileName?: string;
        title: string;
        readTimestamp: string;
        keyFindings: string;
        removedReason: string;
        usefulness: "high" | "medium" | "low";
    }>;
    researchNotebook: string;
    totalTokens: number;
    events: Array<{ eventId: string; type: string; documentId?: string; createdAt: string }>;
    artifacts: Array<{ artifactId: string; type: string; title: string; createdAt: string }>;
    contextBudget?: {
        status: "ok" | "warning" | "critical";
        totalTokens: number;
        softLimit: number;
        hardLimit: number;
        message?: string;
    };
}

function newSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function AgentPageClient() {
    const { t } = useLanguage();
    const settings = useAgentSettings();
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [sessionId, setSessionId] = useState<string>("");
    const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null);
    const [showWorkspace, setShowWorkspace] = useState(false);
    const [showHistory, setShowHistory] = useState(true);
    const [conversations, setConversations] = useState<ChatConversation[]>([]);
    const [modelOpen, setModelOpen] = useState(false);

    const [hydrated, setHydrated] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    // ─── Restore conversations from localStorage on first mount ──────
    useEffect(() => {
        const list = loadConversations();
        const activeId = loadActiveId();
        setConversations(list);

        const active = activeId ? list.find((c) => c.id === activeId) : null;
        if (active) {
            setSessionId(active.id);
            setMessages(active.messages);
            setWorkspace((active.workspace as WorkspaceSnapshot | null) ?? null);
        } else {
            const id = newSessionId();
            setSessionId(id);
            saveActiveId(id);
        }
        setHydrated(true);
    }, []);

    // Persist active conversation snapshot whenever messages or workspace change.
    useEffect(() => {
        if (!hydrated || !sessionId) return;
        upsertConversation({ id: sessionId, messages, workspace });
        // Refresh sidebar list so titles / order stay in sync
        setConversations(loadConversations());
    }, [hydrated, sessionId, messages, workspace]);

    // Track active session id in localStorage.
    useEffect(() => {
        if (!hydrated || !sessionId) return;
        saveActiveId(sessionId);
    }, [hydrated, sessionId]);

    // Scroll to bottom on new messages.
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // ─── Core: send a turn (optionally regenerating an old one) ──
    const runTurn = useCallback(
        async (
            userText: string,
            historyMessages: Message[],
            replaceAgentId?: string,
        ) => {
            if (settings.needsKey) {
                // Surface the model picker so the user can supply a key.
                setModelOpen(true);
                return;
            }
            if (!settings.model.trim()) {
                setModelOpen(true);
                return;
            }

            // Pre-compute the placeholder agent message id.
            const agentMsgId = replaceAgentId || `msg-${Date.now() + 1}`;

            // Apply local state updates for the optimistic placeholder.
            setMessages((prev) => {
                if (replaceAgentId) {
                    return prev.map((m) =>
                        m.id === replaceAgentId
                            ? { ...m, content: "", toolCalls: [], timestamp: new Date().toISOString() }
                            : m
                    );
                }
                return prev;
            });

            setIsLoading(true);

            try {
                // Build history for API (without tool calls, just text).
                const history = historyMessages
                    .filter((m) => m.role === "user" || m.role === "agent")
                    .filter((m) => m.content)
                    .map((m) => ({
                        role: m.role === "user" ? "user" : "model",
                        text: m.content,
                    }));

                abortRef.current = new AbortController();

                const res = await fetch("/api/agent/chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        message: userText,
                        sessionId,
                        history,
                        ...settings.requestOverrides(),
                    }),
                    signal: abortRef.current.signal,
                });

                if (!res.ok) throw new Error(`API error: ${res.status}`);

                const reader = res.body?.getReader();
                if (!reader) throw new Error("No response body");

                const decoder = new TextDecoder();
                let buffer = "";

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split("\n");
                    buffer = lines.pop() || "";

                    for (const line of lines) {
                        if (!line.trim()) continue;
                        try {
                            const event = JSON.parse(line);
                            switch (event.type) {
                                case "text":
                                    setMessages((prev) =>
                                        prev.map((m) =>
                                            m.id === agentMsgId
                                                ? { ...m, content: m.content + event.content }
                                                : m
                                        )
                                    );
                                    break;

                                case "tool_call":
                                    setMessages((prev) =>
                                        prev.map((m) =>
                                            m.id === agentMsgId
                                                ? {
                                                    ...m,
                                                    toolCalls: [
                                                        ...(m.toolCalls || []),
                                                        {
                                                            name: event.tool,
                                                            args: event.args,
                                                            status: "running" as const,
                                                        },
                                                    ],
                                                }
                                                : m
                                        )
                                    );
                                    break;

                                case "tool_result":
                                    setMessages((prev) =>
                                        prev.map((m) => {
                                            if (m.id !== agentMsgId) return m;
                                            let updated = false;
                                            return {
                                                ...m,
                                                toolCalls: (m.toolCalls || []).map((tc) => {
                                                    if (!updated && tc.name === event.tool && tc.status === "running") {
                                                        updated = true;
                                                        return {
                                                            ...tc,
                                                            status: event.success
                                                                ? ("done" as const)
                                                                : ("error" as const),
                                                        };
                                                    }
                                                    return tc;
                                                }),
                                            };
                                        })
                                    );
                                    break;

                                case "workspace":
                                    setWorkspace(event.workspace);
                                    if (
                                        event.workspace.activeReferences?.length > 0 ||
                                        event.workspace.readingHistory?.length > 0
                                    ) {
                                        setShowWorkspace(true);
                                    }
                                    break;

                                case "error":
                                    setMessages((prev) =>
                                        prev.map((m) =>
                                            m.id === agentMsgId
                                                ? {
                                                    ...m,
                                                    content:
                                                        m.content + `\n\n❌ Error: ${event.error}`,
                                                }
                                                : m
                                        )
                                    );
                                    break;

                                case "status":
                                    setMessages((prev) =>
                                        prev.map((m) =>
                                            m.id === agentMsgId
                                                ? { ...m, content: m.content + `\n${event.message}` }
                                                : m
                                        )
                                    );
                                    break;
                            }
                        } catch {
                            /* skip malformed JSON */
                        }
                    }
                }
            } catch (err) {
                if (err instanceof Error && err.name === "AbortError") {
                    /* user cancelled */
                } else {
                    setMessages((prev) =>
                        prev.map((m) =>
                            m.id === agentMsgId
                                ? {
                                    ...m,
                                    content:
                                        m.content +
                                        `\n\n❌ Request failed: ${err instanceof Error ? err.message : "Unknown error"}`,
                                }
                                : m
                        )
                    );
                }
            } finally {
                setIsLoading(false);
                abortRef.current = null;
            }
        },
        [sessionId, settings],
    );

    const handleSend = useCallback(
        async (text: string) => {
            if (!text.trim() || isLoading) return;

            const userMsg: Message = {
                id: `msg-${Date.now()}`,
                role: "user",
                content: text,
                timestamp: new Date().toISOString(),
            };
            const agentMsgId = `msg-${Date.now() + 1}`;
            const agentMsg: Message = {
                id: agentMsgId,
                role: "agent",
                content: "",
                timestamp: new Date().toISOString(),
                toolCalls: [],
            };

            const historySnapshot = messages;
            setMessages((prev) => [...prev, userMsg, agentMsg]);

            await runTurn(text, historySnapshot, agentMsgId);
        },
        [isLoading, messages, runTurn],
    );

    const handleRegenerate = useCallback(
        async (agentMsgId: string) => {
            if (isLoading) return;
            const idx = messages.findIndex((m) => m.id === agentMsgId);
            if (idx <= 0) return;
            // Find the closest preceding user message.
            let userIdx = idx - 1;
            while (userIdx >= 0 && messages[userIdx].role !== "user") userIdx--;
            if (userIdx < 0) return;

            const userText = messages[userIdx].content;
            // History excludes the user prompt being regenerated and everything after.
            const historySnapshot = messages.slice(0, userIdx);
            await runTurn(userText, historySnapshot, agentMsgId);
        },
        [isLoading, messages, runTurn],
    );

    const handleCopy = useCallback((text: string) => {
        if (typeof navigator !== "undefined" && navigator.clipboard) {
            navigator.clipboard.writeText(text).catch(() => {
                /* ignore */
            });
        }
    }, []);

    const handleNewChat = useCallback(() => {
        if (abortRef.current) abortRef.current.abort();
        const id = newSessionId();
        setSessionId(id);
        setMessages([]);
        setWorkspace(null);
        saveActiveId(id);
    }, []);

    const handleSelectConversation = useCallback(
        (id: string) => {
            if (id === sessionId) return;
            if (abortRef.current) abortRef.current.abort();
            const conv = loadConversations().find((c) => c.id === id);
            if (!conv) return;
            setSessionId(id);
            setMessages(conv.messages);
            setWorkspace((conv.workspace as WorkspaceSnapshot | null) ?? null);
            saveActiveId(id);
        },
        [sessionId],
    );

    const handleDeleteConversation = useCallback(
        (id: string) => {
            deleteConv(id);
            const list = loadConversations();
            setConversations(list);
            if (id === sessionId) {
                if (list.length > 0) {
                    handleSelectConversation(list[0].id);
                } else {
                    handleNewChat();
                }
            }
        },
        [sessionId, handleSelectConversation, handleNewChat],
    );

    const handleClearAllConversations = useCallback(() => {
        clearAllConversations();
        setConversations([]);
        handleNewChat();
    }, [handleNewChat]);

    // Index of the last agent message (used to gate the regenerate button).
    const lastAgentIdx = (() => {
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === "agent") return i;
        }
        return -1;
    })();

    return (
        <div className="flex h-[calc(100vh-64px)] max-w-[1600px] mx-auto">
            {/* ─── Conversation history sidebar ─── */}
            {showHistory && (
                <ConversationSidebar
                    conversations={conversations}
                    activeId={sessionId}
                    onSelect={handleSelectConversation}
                    onDelete={handleDeleteConversation}
                    onNew={handleNewChat}
                    onClearAll={handleClearAllConversations}
                    onClose={() => setShowHistory(false)}
                />
            )}

            {/* ─── Main Chat Area ─── */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-3 border-b border-border/50">
                    <div className="flex items-center gap-3">
                        {!showHistory && (
                            <button
                                onClick={() => setShowHistory(true)}
                                className="view-btn"
                                title="Conversation history"
                                aria-label="Open conversation history"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="3" y1="12" x2="21" y2="12" />
                                    <line x1="3" y1="6" x2="21" y2="6" />
                                    <line x1="3" y1="18" x2="21" y2="18" />
                                </svg>
                            </button>
                        )}
                        <div className="w-8 h-8 rounded-lg agent-avatar flex items-center justify-center">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary-foreground">
                                <path d="M12 8V4H8" />
                                <rect width="16" height="12" x="4" y="8" rx="2" />
                                <path d="M2 14h2" />
                                <path d="M20 14h2" />
                                <path d="M15 13v2" />
                                <path d="M9 13v2" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold text-foreground">{t("agent.title")}</h2>
                            <p className="text-xs text-muted-foreground">{t("agent.subtitle")}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <ModelSelector
                            settings={settings}
                            open={modelOpen}
                            onOpenChange={setModelOpen}
                            align="end"
                        />
                        <div className="w-px h-6 bg-border mx-1"></div>
                        <button
                            onClick={() => setShowWorkspace(!showWorkspace)}
                            className={`view-btn ${showWorkspace ? "active" : ""}`}
                            title={t("agent.workspace")}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                            </svg>
                            <span className="text-xs hidden sm:inline">{t("agent.workspace")}</span>
                        </button>
                        <button onClick={handleNewChat} className="view-btn" title={t("agent.newChat")}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 5v14" />
                                <path d="M5 12h14" />
                            </svg>
                            <span className="text-xs hidden sm:inline">{t("agent.newChat")}</span>
                        </button>
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-6 py-4 chat-scroll">
                    {messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                            <div className="w-16 h-16 rounded-2xl agent-avatar flex items-center justify-center mb-4">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary-foreground">
                                    <path d="M12 8V4H8" />
                                    <rect width="16" height="12" x="4" y="8" rx="2" />
                                    <path d="M2 14h2" />
                                    <path d="M20 14h2" />
                                    <path d="M15 13v2" />
                                    <path d="M9 13v2" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-semibold gradient-text mb-2">{t("agent.title")}</h3>
                            <p className="text-sm text-muted-foreground max-w-md mb-6">
                                {t("agent.emptyHint")}
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg w-full">
                                {[
                                    "What is Bayesian statistics? Explain using my library.",
                                    "Find textbooks about kernel methods in machine learning.",
                                    "How are stochastic processes used in financial modeling?",
                                    "What are the basic principles of Monte Carlo methods?",
                                ].map((q) => (
                                    <button
                                        key={q}
                                        onClick={() => handleSend(q)}
                                        className="suggestion-chip text-left"
                                    >
                                        <span className="text-xs">{q}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4 max-w-3xl mx-auto">
                            {messages.map((msg, i) => (
                                <ChatMessage
                                    key={msg.id}
                                    message={msg}
                                    canRegenerate={
                                        msg.role === "agent" &&
                                        i === lastAgentIdx &&
                                        !isLoading
                                    }
                                    onRegenerate={() => handleRegenerate(msg.id)}
                                    onCopy={msg.role === "agent" ? () => handleCopy(msg.content) : undefined}
                                />
                            ))}
                            {isLoading && (
                                <div className="flex items-center gap-2 text-muted-foreground text-sm pl-10">
                                    <div className="typing-indicator">
                                        <span></span>
                                        <span></span>
                                        <span></span>
                                    </div>
                                    {t("agent.thinking")}
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                    )}
                </div>

                {/* Input */}
                <ChatInput onSend={handleSend} isLoading={isLoading} />
            </div>

            {/* ─── Workspace Panel ─── */}
            {showWorkspace && (
                <WorkspacePanel
                    workspace={workspace}
                    onClose={() => setShowWorkspace(false)}
                />
            )}
        </div>
    );
}
