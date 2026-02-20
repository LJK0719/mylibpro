"use client";

import { useState } from "react";

interface ActiveReference {
    referenceId: string;
    documentId: string;
    title: string;
    authors: string[];
    year: number;
    tokenCount: number;
    loadedAt: string;
}

interface ReadingHistoryEntry {
    historyId: string;
    documentId: string;
    title: string;
    readTimestamp: string;
    keyFindings: string;
    removedReason: string;
}

interface WorkspaceSnapshot {
    sessionId: string;
    activeReferences: ActiveReference[];
    readingHistory: ReadingHistoryEntry[];
    researchNotebook: string;
    totalTokens: number;
}

interface WorkspacePanelProps {
    workspace: WorkspaceSnapshot | null;
    onClose: () => void;
}

export function WorkspacePanel({ workspace, onClose }: WorkspacePanelProps) {
    const [activeTab, setActiveTab] = useState<"refs" | "history" | "notes">(
        "refs"
    );

    const refs = workspace?.activeReferences || [];
    const history = workspace?.readingHistory || [];
    const notebook = workspace?.researchNotebook || "";
    const totalTokens = workspace?.totalTokens || 0;

    // Token budget bar (assume 1M token budget)
    const TOKEN_BUDGET = 1_000_000;
    const tokenPercent = Math.min(100, (totalTokens / TOKEN_BUDGET) * 100);

    return (
        <div className="workspace-panel border-l border-border/50 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
                <h3 className="text-sm font-semibold text-foreground">工作区</h3>
                <button
                    onClick={onClose}
                    className="text-muted-foreground hover:text-foreground transition-colors"
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
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                    </svg>
                </button>
            </div>

            {/* Token budget */}
            <div className="px-4 py-2 border-b border-border/30">
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                    <span>上下文占用</span>
                    <span>
                        {totalTokens > 1000
                            ? `${(totalTokens / 1000).toFixed(0)}K`
                            : totalTokens}{" "}
                        / 1M tokens
                    </span>
                </div>
                <div className="token-bar-bg">
                    <div
                        className="token-bar-fill"
                        style={{ width: `${tokenPercent}%` }}
                    />
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border/30">
                {[
                    { id: "refs" as const, label: "📚 参考文献", count: refs.length },
                    { id: "history" as const, label: "📖 阅读历史", count: history.length },
                    { id: "notes" as const, label: "📝 笔记", count: notebook ? 1 : 0 },
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 py-2 text-[11px] font-medium transition-colors relative ${activeTab === tab.id
                                ? "text-primary"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                    >
                        {tab.label}
                        {tab.count > 0 && (
                            <span className="ml-1 text-[9px] opacity-60">({tab.count})</span>
                        )}
                        {activeTab === tab.id && (
                            <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full" />
                        )}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
                {activeTab === "refs" && (
                    <div className="space-y-2">
                        {refs.length === 0 ? (
                            <div className="text-center py-8">
                                <p className="text-xs text-muted-foreground">
                                    暂无激活的参考文献
                                </p>
                                <p className="text-[10px] text-muted-foreground/60 mt-1">
                                    开始提问后，Agent 会自动加载相关文献
                                </p>
                            </div>
                        ) : (
                            refs.map((ref) => (
                                <div key={ref.referenceId} className="reference-item">
                                    <h4 className="text-xs font-medium text-foreground line-clamp-2 mb-1">
                                        {ref.title}
                                    </h4>
                                    <p className="text-[10px] text-muted-foreground line-clamp-1">
                                        {ref.authors.join(", ")} · {ref.year}
                                    </p>
                                    <div className="flex items-center justify-between mt-1.5">
                                        <span className="text-[10px] text-muted-foreground/70">
                                            {ref.tokenCount > 1000
                                                ? `${(ref.tokenCount / 1000).toFixed(0)}K`
                                                : ref.tokenCount}{" "}
                                            tokens
                                        </span>
                                        <span className="text-[9px] text-primary/60">
                                            活跃
                                        </span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {activeTab === "history" && (
                    <div className="space-y-2">
                        {history.length === 0 ? (
                            <div className="text-center py-8">
                                <p className="text-xs text-muted-foreground">
                                    暂无阅读历史
                                </p>
                            </div>
                        ) : (
                            history.map((h) => (
                                <div key={h.historyId} className="reference-item opacity-70">
                                    <h4 className="text-xs font-medium text-foreground line-clamp-1 mb-1">
                                        {h.title}
                                    </h4>
                                    {h.keyFindings && (
                                        <p className="text-[10px] text-muted-foreground line-clamp-2">
                                            {h.keyFindings}
                                        </p>
                                    )}
                                    <p className="text-[9px] text-muted-foreground/50 mt-1">
                                        {new Date(h.readTimestamp).toLocaleString("zh-CN")}
                                    </p>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {activeTab === "notes" && (
                    <div>
                        {!notebook ? (
                            <div className="text-center py-8">
                                <p className="text-xs text-muted-foreground">
                                    暂无研究笔记
                                </p>
                                <p className="text-[10px] text-muted-foreground/60 mt-1">
                                    Agent 在深入研究时会自动记录
                                </p>
                            </div>
                        ) : (
                            <div className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">
                                {notebook}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
