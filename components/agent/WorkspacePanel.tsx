"use client";

import { useState } from "react";
import { useLanguage } from "@/components/common/LanguageProvider";

interface ActiveReference {
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
}

interface ReadingHistoryEntry {
    historyId: string;
    documentId: string;
    referenceKind: "document" | "chapter";
    chapterFileName?: string;
    title: string;
    readTimestamp: string;
    keyFindings: string;
    removedReason: string;
    usefulness: "high" | "medium" | "low";
}

interface WorkspaceSnapshot {
    sessionId: string;
    activeReferences: ActiveReference[];
    readingHistory: ReadingHistoryEntry[];
    researchNotebook: string;
    totalTokens: number;
    events: Array<{
        eventId: string;
        type: string;
        documentId?: string;
        createdAt: string;
    }>;
    artifacts: Array<{
        artifactId: string;
        type: string;
        title: string;
        createdAt: string;
    }>;
    contextBudget?: {
        status: "ok" | "warning" | "critical";
        totalTokens: number;
        softLimit: number;
        hardLimit: number;
        message?: string;
    };
}

interface WorkspacePanelProps {
    workspace: WorkspaceSnapshot | null;
    onClose: () => void;
}

export function WorkspacePanel({ workspace, onClose }: WorkspacePanelProps) {
    const { language, t } = useLanguage();
    const [activeTab, setActiveTab] = useState<"refs" | "history" | "notes" | "trace">(
        "refs"
    );

    const refs = workspace?.activeReferences || [];
    const history = workspace?.readingHistory || [];
    const notebook = workspace?.researchNotebook || "";
    const totalTokens = workspace?.totalTokens || 0;
    const events = workspace?.events || [];
    const artifacts = workspace?.artifacts || [];
    const budget = workspace?.contextBudget;

    const TOKEN_BUDGET = budget?.hardLimit || 150_000;
    const tokenPercent = Math.min(100, (totalTokens / TOKEN_BUDGET) * 100);

    return (
        <div className="workspace-panel border-l border-border/50 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
                <h3 className="text-sm font-semibold text-foreground">{t("agent.workspace")}</h3>
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
                    <span>{language === "zh" ? "上下文占用" : "Context budget"}</span>
                    <span>
                        {totalTokens > 1000
                            ? `${(totalTokens / 1000).toFixed(0)}K`
                            : totalTokens}{" "}
                        / {(TOKEN_BUDGET / 1000).toFixed(0)}K tokens
                    </span>
                </div>
                <div className="token-bar-bg">
                    <div
                        className="token-bar-fill"
                        style={{ width: `${tokenPercent}%` }}
                    />
                </div>
                {budget?.message && (
                    <p
                        className={`text-[10px] mt-1 ${
                            budget.status === "critical"
                                ? "text-red-500"
                                : "text-amber-500"
                        }`}
                    >
                        {budget.message}
                    </p>
                )}
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border/30">
                {[
                    { id: "refs" as const, label: language === "zh" ? "参考" : "Refs", count: refs.length },
                    { id: "history" as const, label: language === "zh" ? "已读" : "Read", count: history.length },
                    { id: "notes" as const, label: language === "zh" ? "笔记" : "Notes", count: notebook ? 1 : 0 },
                    { id: "trace" as const, label: language === "zh" ? "追踪" : "Trace", count: events.length },
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
                                    {language === "zh" ? "暂无激活的参考文献" : "No active references"}
                                </p>
                                <p className="text-[10px] text-muted-foreground/60 mt-1">
                                    {language === "zh" ? "开始提问后，Agent 会自动加载相关文献" : "The agent will load relevant documents after you ask a question."}
                                </p>
                            </div>
                        ) : (
                            refs.map((ref) => (
                                <div key={ref.referenceId} className="reference-item">
                                    <h4 className="text-xs font-medium text-foreground line-clamp-2 mb-1">
                                        {ref.title}
                                    </h4>
                                    <p className="text-[10px] text-muted-foreground line-clamp-1">
                                        {ref.referenceKind}
                                        {ref.chapterFileName ? ` · ${ref.chapterFileName}` : ""}
                                        {" · "}
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
                                            {ref.usefulness}
                                        </span>
                                    </div>
                                    {ref.reasonToKeep && (
                                        <p className="text-[10px] text-muted-foreground/70 line-clamp-2 mt-1">
                                            {ref.reasonToKeep}
                                        </p>
                                    )}
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
                                    {language === "zh" ? "暂无阅读历史" : "No reading history"}
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
                                    {h.removedReason && (
                                        <p className="text-[10px] text-muted-foreground line-clamp-2">
                                            {language === "zh" ? "移出原因：" : "Removed: "}{h.removedReason}
                                        </p>
                                    )}
                                    <p className="text-[9px] text-muted-foreground/50 mt-1">
                                        {h.usefulness} · {h.referenceKind}
                                        {h.chapterFileName ? ` · ${h.chapterFileName}` : ""} ·{" "}
                                        {new Date(h.readTimestamp).toLocaleString(language === "zh" ? "zh-CN" : "en-US")}
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
                                    {language === "zh" ? "暂无研究笔记" : "No research notes"}
                                </p>
                                <p className="text-[10px] text-muted-foreground/60 mt-1">
                                    {language === "zh" ? "Agent 在深入研究时会自动记录" : "The agent records notes during deep research."}
                                </p>
                            </div>
                        ) : (
                            <div className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">
                                {notebook}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === "trace" && (
                    <div className="space-y-3">
                        <div>
                            <h4 className="text-[11px] font-semibold text-foreground mb-2">
                                Events
                            </h4>
                            {events.length === 0 ? (
                                <p className="text-xs text-muted-foreground">{language === "zh" ? "暂无事件" : "No events"}</p>
                            ) : (
                                <div className="space-y-1.5">
                                    {events.slice(-12).map((event) => (
                                        <div key={event.eventId} className="reference-item">
                                            <p className="text-xs text-foreground">
                                                {event.type}
                                            </p>
                                            <p className="text-[10px] text-muted-foreground">
                                                {event.documentId || "session"} ·{" "}
                                                {new Date(event.createdAt).toLocaleTimeString(
                                                    language === "zh" ? "zh-CN" : "en-US"
                                                )}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div>
                            <h4 className="text-[11px] font-semibold text-foreground mb-2">
                                Artifacts
                            </h4>
                            {artifacts.length === 0 ? (
                                <p className="text-xs text-muted-foreground">{language === "zh" ? "暂无产物" : "No artifacts"}</p>
                            ) : (
                                <div className="space-y-1.5">
                                    {artifacts.slice(-8).map((artifact) => (
                                        <div
                                            key={artifact.artifactId}
                                            className="reference-item"
                                        >
                                            <p className="text-xs text-foreground line-clamp-1">
                                                {artifact.title}
                                            </p>
                                            <p className="text-[10px] text-muted-foreground">
                                                {artifact.type}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
