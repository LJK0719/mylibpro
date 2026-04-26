"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type { Message, ToolCall } from "@/lib/types/chat";
import { useLanguage } from "@/components/common/LanguageProvider";

export type { Message, ToolCall } from "@/lib/types/chat";

const TOOL_LABELS: Record<string, { label: string; icon: string }> = {
    search_library: { label: "搜索图书馆", icon: "🔍" },
    load_full_text: { label: "加载全文", icon: "📖" },
    load_chapter: { label: "加载章节", icon: "⚙️" },
    get_document_detail: { label: "查看文献详情", icon: "📋" },
    record_reading: { label: "记录阅读发现", icon: "✍️" },
    update_research_notes: { label: "更新研究笔记", icon: "📝" },
    decide_continue_or_answer: { label: "判断是否回答", icon: "⚙️" },
    remove_reference: { label: "移除参考文献", icon: "🗑️" },
};

const TOOL_LABELS_EN: Record<string, { label: string; icon: string }> = {
    search_library: { label: "Search library", icon: "🔍" },
    load_full_text: { label: "Load full text", icon: "📖" },
    load_chapter: { label: "Load chapter", icon: "⚙️" },
    get_document_detail: { label: "View document detail", icon: "📋" },
    record_reading: { label: "Record reading", icon: "✍️" },
    update_research_notes: { label: "Update notes", icon: "📝" },
    decide_continue_or_answer: { label: "Decide next step", icon: "⚙️" },
    remove_reference: { label: "Remove reference", icon: "🗑️" },
};

function ToolCallCard({ tc }: { tc: ToolCall }) {
    const { language } = useLanguage();
    const labels = language === "zh" ? TOOL_LABELS : TOOL_LABELS_EN;
    const info = labels[tc.name] || { label: tc.name, icon: "⚙️" };
    const statusClass =
        tc.status === "running"
            ? "tool-card-running"
            : tc.status === "done"
                ? "tool-card-done"
                : "tool-card-error";

    let desc = "";
    if (tc.name === "search_library" && tc.args.query) {
        desc = language === "zh" ? `关键词: ${tc.args.query}` : `Query: ${tc.args.query}`;
        if (tc.args.discipline) desc += language === "zh" ? ` · 学科: ${tc.args.discipline}` : ` · Discipline: ${tc.args.discipline}`;
        if (tc.args.type) desc += language === "zh" ? ` · 类型: ${tc.args.type}` : ` · Type: ${tc.args.type}`;
    } else if (
        (tc.name === "load_full_text" || tc.name === "load_chapter" || tc.name === "get_document_detail") &&
        tc.args.document_id
    ) {
        desc = `ID: ${tc.args.document_id}`;
        if (tc.args.chapter_file_name) desc += ` · ${tc.args.chapter_file_name}`;
    } else if (tc.name === "record_reading" && tc.args.document_id) {
        desc = `${tc.args.document_id}`;
        if (tc.args.key_findings) {
            const findings = String(tc.args.key_findings);
            desc = findings.length > 60 ? findings.substring(0, 60) + "..." : findings;
        }
    } else if (tc.name === "update_research_notes") {
        desc = tc.args.mode === "replace" ? (language === "zh" ? "替换笔记" : "Replace notes") : (language === "zh" ? "追加笔记" : "Append notes");
    } else if (tc.name === "remove_reference" && tc.args.document_id) {
        desc = language === "zh" ? `移除: ${tc.args.document_id}` : `Remove: ${tc.args.document_id}`;
        if (tc.args.reason) desc = String(tc.args.reason).substring(0, 50);
    } else if (tc.name === "decide_continue_or_answer") {
        desc = `${tc.args.decision || "decide"}`;
        if (tc.args.reason) desc += ` · ${String(tc.args.reason).substring(0, 50)}`;
    }

    return (
        <div className={`tool-call-card ${statusClass}`}>
            <div className="flex items-center gap-2">
                <span className="text-sm">{info.icon}</span>
                <span className="text-xs font-medium">{info.label}</span>
                {tc.status === "running" && <div className="tool-spinner" />}
                {tc.status === "done" && (
                    <span className="text-xs text-emerald-500">✓</span>
                )}
                {tc.status === "error" && (
                    <span className="text-xs text-red-400">✗</span>
                )}
            </div>
            {desc && (
                <p className="text-xs text-muted-foreground mt-1 truncate">{desc}</p>
            )}
        </div>
    );
}

/**
 * Normalize LaTeX delimiters so remark-math (which only understands
 * `$...$` / `$$...$$`) also handles common backslash escapes:
 *
 *   \( ... \)   →  $ ... $
 *   \[ ... \]   →  $$ ... $$
 *
 * Conversion is regex based but skips fenced code blocks and inline
 * code spans so we don't accidentally rewrite literal source code.
 */
function normalizeMath(input: string): string {
    if (!input) return input;

    // Split on ``` fences, transform only the non-code segments.
    const segments = input.split(/(```[\s\S]*?```|`[^`\n]*`)/g);
    return segments
        .map((seg) => {
            if (!seg) return seg;
            if (seg.startsWith("```") || (seg.startsWith("`") && seg.endsWith("`"))) {
                return seg;
            }
            // Display math \[ ... \]  (allow newlines inside)
            seg = seg.replace(/\\\[([\s\S]+?)\\\]/g, (_m, inner) => `\n$$\n${inner.trim()}\n$$\n`);
            // Inline math \( ... \)
            seg = seg.replace(/\\\(([\s\S]+?)\\\)/g, (_m, inner) => `$${inner.trim()}$`);
            return seg;
        })
        .join("");
}

function MarkdownContent({ text }: { text: string }) {
    const normalized = normalizeMath(text);
    return (
        <div className="markdown-body">
            <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                    code({ className, children, ...props }) {
                        const isBlock = /language-/.test(className || "");
                        if (isBlock) {
                            const lang = (className || "").replace(/.*language-/, "");
                            return (
                                <pre className="code-block">
                                    <div className="code-block-header">{lang || "code"}</div>
                                    <code className={className} {...props}>
                                        {children}
                                    </code>
                                </pre>
                            );
                        }
                        return (
                            <code className="inline-code" {...props}>
                                {children}
                            </code>
                        );
                    },
                    a({ href, children, ...props }) {
                        return (
                            <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary underline underline-offset-2"
                                {...props}
                            >
                                {children}
                            </a>
                        );
                    },
                    table({ children, ...props }) {
                        return (
                            <div className="overflow-x-auto my-2">
                                <table className="md-table" {...props}>
                                    {children}
                                </table>
                            </div>
                        );
                    },
                }}
            >
                {normalized}
            </ReactMarkdown>
        </div>
    );
}

interface ChatMessageProps {
    message: Message;
    /** When true, show the regenerate action (only on the last agent message). */
    canRegenerate?: boolean;
    onRegenerate?: () => void;
    onCopy?: () => void;
}

export function ChatMessage({
    message,
    canRegenerate,
    onRegenerate,
    onCopy,
}: ChatMessageProps) {
    const { t } = useLanguage();
    const isUser = message.role === "user";

    if (isUser) {
        return (
            <div className="flex justify-end">
                <div className="user-bubble">
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex gap-3 group">
            <div className="w-7 h-7 rounded-lg agent-avatar flex-shrink-0 flex items-center justify-center mt-1">
                <svg
                    width="14"
                    height="14"
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
            <div className="flex-1 min-w-0">
                {message.toolCalls && message.toolCalls.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                        {message.toolCalls.map((tc, i) => (
                            <ToolCallCard key={i} tc={tc} />
                        ))}
                    </div>
                )}

                {message.content && (
                    <div className="agent-bubble">
                        <MarkdownContent text={message.content} />
                    </div>
                )}

                {(canRegenerate || onCopy) && message.content && (
                    <div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        {onCopy && (
                            <button
                                type="button"
                                onClick={onCopy}
                                className="msg-action-btn"
                                title={t("agent.copy")}
                            >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                                    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                                </svg>
                                <span>{t("agent.copy")}</span>
                            </button>
                        )}
                        {canRegenerate && onRegenerate && (
                            <button
                                type="button"
                                onClick={onRegenerate}
                                className="msg-action-btn"
                                title={t("agent.regenerate")}
                            >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 12a9 9 0 1 1-3-6.7" />
                                    <path d="M21 4v5h-5" />
                                </svg>
                                <span>{t("agent.regenerate")}</span>
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
