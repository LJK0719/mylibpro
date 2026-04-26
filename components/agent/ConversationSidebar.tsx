"use client";

import type { ChatConversation } from "@/lib/agent/storage";
import { useLanguage } from "@/components/common/LanguageProvider";
import type { Language } from "@/lib/i18n";

interface ConversationSidebarProps {
    conversations: ChatConversation[];
    activeId: string;
    onSelect: (id: string) => void;
    onDelete: (id: string) => void;
    onNew: () => void;
    onClearAll: () => void;
    onClose?: () => void;
}

function relativeTime(iso: string, language: Language): string {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return "";
    const diffMs = Date.now() - t;
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return language === "zh" ? "刚刚" : "just now";
    if (min < 60) return language === "zh" ? `${min} 分钟前` : `${min} min ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return language === "zh" ? `${hr} 小时前` : `${hr} hr ago`;
    const day = Math.floor(hr / 24);
    if (day < 7) return language === "zh" ? `${day} 天前` : `${day} days ago`;
    return new Date(iso).toLocaleDateString(language === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric" });
}

export function ConversationSidebar({
    conversations,
    activeId,
    onSelect,
    onDelete,
    onNew,
    onClearAll,
    onClose,
}: ConversationSidebarProps) {
    const { language, t } = useLanguage();
    return (
        <aside className="conversation-sidebar">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {language === "zh" ? "对话历史" : "Conversation history"}
                </span>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="p-1 rounded hover:bg-muted text-muted-foreground"
                        title={language === "zh" ? "关闭" : "Close"}
                        aria-label={language === "zh" ? "关闭对话历史" : "Close conversation history"}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 6 6 18" />
                            <path d="m6 6 12 12" />
                        </svg>
                    </button>
                )}
            </div>

            <div className="px-3 pt-3">
                <button onClick={onNew} className="conversation-new-btn">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 5v14" />
                        <path d="M5 12h14" />
                    </svg>
                    <span>{t("agent.newChat")}</span>
                </button>
            </div>

            <div className="flex-1 overflow-y-auto px-2 py-2 chat-scroll">
                {conversations.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center mt-6 px-3">
                        {language === "zh" ? "还没有历史对话" : "No conversation history yet"}
                    </p>
                ) : (
                    <ul className="space-y-1">
                        {conversations.map((c) => (
                            <li key={c.id}>
                                <div
                                    onClick={() => onSelect(c.id)}
                                    className={`conversation-item group ${c.id === activeId ? "active" : ""}`}
                                >
                                    <div className="flex-1 min-w-0 text-left">
                                        <div className="text-xs font-medium truncate">{c.title}</div>
                                        <div className="text-[10px] text-muted-foreground mt-0.5">
                                            {relativeTime(c.updatedAt, language)} · {c.messages.length} {language === "zh" ? "条" : "messages"}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (confirm(language === "zh" ? `删除对话「${c.title}」？` : `Delete conversation "${c.title}"?`)) onDelete(c.id);
                                        }}
                                        className="conversation-delete"
                                        title={language === "zh" ? "删除" : "Delete"}
                                        aria-label={language === "zh" ? "删除对话" : "Delete conversation"}
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M3 6h18" />
                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                                            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                        </svg>
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {conversations.length > 0 && (
                <div className="border-t border-border/50 px-3 py-2">
                    <button
                        onClick={() => {
                            if (confirm(language === "zh" ? "清除全部对话历史？此操作不可撤销。" : "Clear all conversation history? This cannot be undone.")) onClearAll();
                        }}
                        className="text-[11px] text-muted-foreground hover:text-destructive transition-colors w-full text-center py-1"
                    >
                        {language === "zh" ? "清除全部" : "Clear all"}
                    </button>
                </div>
            )}
        </aside>
    );
}
