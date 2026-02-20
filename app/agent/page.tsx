"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChatMessage, type Message } from "@/components/agent/ChatMessage";
import { ChatInput } from "@/components/agent/ChatInput";
import { WorkspacePanel } from "@/components/agent/WorkspacePanel";

interface WorkspaceSnapshot {
    sessionId: string;
    activeReferences: Array<{
        referenceId: string;
        documentId: string;
        title: string;
        authors: string[];
        year: number;
        tokenCount: number;
        loadedAt: string;
    }>;
    readingHistory: Array<{
        historyId: string;
        documentId: string;
        title: string;
        readTimestamp: string;
        keyFindings: string;
        removedReason: string;
    }>;
    researchNotebook: string;
    totalTokens: number;
}

export default function AgentPage() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [sessionId, setSessionId] = useState<string>("");
    const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null);
    const [showWorkspace, setShowWorkspace] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    // Initialize session
    useEffect(() => {
        const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        setSessionId(id);
    }, []);

    // Scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSend = useCallback(
        async (text: string) => {
            if (!text.trim() || isLoading) return;

            // Add user message
            const userMsg: Message = {
                id: `msg-${Date.now()}`,
                role: "user",
                content: text,
                timestamp: new Date().toISOString(),
            };

            setMessages((prev) => [...prev, userMsg]);
            setIsLoading(true);

            // Create placeholder for agent response
            const agentMsgId = `msg-${Date.now() + 1}`;
            const agentMsg: Message = {
                id: agentMsgId,
                role: "agent",
                content: "",
                timestamp: new Date().toISOString(),
                toolCalls: [],
            };
            setMessages((prev) => [...prev, agentMsg]);

            try {
                // Build history for API (without tool calls, just text)
                const history = messages
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
                        message: text,
                        sessionId,
                        history,
                    }),
                    signal: abortRef.current.signal,
                });

                if (!res.ok) {
                    throw new Error(`API error: ${res.status}`);
                }

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
                                        prev.map((m) =>
                                            m.id === agentMsgId
                                                ? {
                                                    ...m,
                                                    toolCalls: (m.toolCalls || []).map((tc) =>
                                                        tc.name === event.tool
                                                            ? {
                                                                ...tc,
                                                                status: event.success
                                                                    ? ("done" as const)
                                                                    : ("error" as const),
                                                            }
                                                            : tc
                                                    ),
                                                }
                                                : m
                                        )
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
                                                        m.content +
                                                        `\n\n❌ 错误: ${event.error}`,
                                                }
                                                : m
                                        )
                                    );
                                    break;

                                case "status":
                                    // Show API status messages (e.g. rate limit wait)
                                    setMessages((prev) =>
                                        prev.map((m) =>
                                            m.id === agentMsgId
                                                ? {
                                                    ...m,
                                                    content:
                                                        m.content +
                                                        `\n${event.message}`,
                                                }
                                                : m
                                        )
                                    );
                                    break;
                            }
                        } catch {
                            // Skip malformed JSON lines
                        }
                    }
                }
            } catch (err) {
                if (err instanceof Error && err.name === "AbortError") {
                    // User cancelled
                } else {
                    setMessages((prev) =>
                        prev.map((m) =>
                            m.id === agentMsgId
                                ? {
                                    ...m,
                                    content:
                                        m.content +
                                        `\n\n❌ 请求失败: ${err instanceof Error ? err.message : "未知错误"}`,
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
        [isLoading, messages, sessionId]
    );

    const handleNewChat = useCallback(() => {
        setMessages([]);
        setWorkspace(null);
        setSessionId(
            `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        );
    }, []);

    return (
        <div className="flex h-[calc(100vh-64px)] max-w-[1600px] mx-auto">
            {/* ─── Main Chat Area ─── */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-3 border-b border-border/50">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg agent-avatar flex items-center justify-center">
                            <svg
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="text-primary-foreground"
                            >
                                <path d="M12 8V4H8" />
                                <rect width="16" height="12" x="4" y="8" rx="2" />
                                <path d="M2 14h2" />
                                <path d="M20 14h2" />
                                <path d="M15 13v2" />
                                <path d="M9 13v2" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold text-foreground">
                                学术研究助手
                            </h2>
                            <p className="text-xs text-muted-foreground">
                                基于全文检索的深度分析
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowWorkspace(!showWorkspace)}
                            className={`view-btn ${showWorkspace ? "active" : ""}`}
                            title="工作区"
                        >
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                            </svg>
                            <span className="text-xs hidden sm:inline">工作区</span>
                        </button>
                        <button
                            onClick={handleNewChat}
                            className="view-btn"
                            title="新对话"
                        >
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="M12 5v14" />
                                <path d="M5 12h14" />
                            </svg>
                            <span className="text-xs hidden sm:inline">新对话</span>
                        </button>
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-6 py-4 chat-scroll">
                    {messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                            <div className="w-16 h-16 rounded-2xl agent-avatar flex items-center justify-center mb-4">
                                <svg
                                    width="32"
                                    height="32"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="text-primary-foreground"
                                >
                                    <path d="M12 8V4H8" />
                                    <rect width="16" height="12" x="4" y="8" rx="2" />
                                    <path d="M2 14h2" />
                                    <path d="M20 14h2" />
                                    <path d="M15 13v2" />
                                    <path d="M9 13v2" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-semibold gradient-text mb-2">
                                学术研究助手
                            </h3>
                            <p className="text-sm text-muted-foreground max-w-md mb-6">
                                我可以检索你的数字图书馆，深度阅读学术文献，帮你回答专业问题。
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg w-full">
                                {[
                                    "什么是贝叶斯统计？请基于图书馆的文献解释",
                                    "帮我查找关于机器学习中核方法的教材",
                                    "随机过程在金融建模中有哪些应用？",
                                    "蒙特卡罗方法的基本原理是什么？",
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
                            {messages.map((msg) => (
                                <ChatMessage key={msg.id} message={msg} />
                            ))}
                            {isLoading && (
                                <div className="flex items-center gap-2 text-muted-foreground text-sm pl-10">
                                    <div className="typing-indicator">
                                        <span></span>
                                        <span></span>
                                        <span></span>
                                    </div>
                                    思考中...
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
