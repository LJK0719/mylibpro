"use client";

export interface ToolCall {
    name: string;
    args: Record<string, unknown>;
    status: "running" | "done" | "error";
}

export interface Message {
    id: string;
    role: "user" | "agent";
    content: string;
    timestamp: string;
    toolCalls?: ToolCall[];
}

const TOOL_LABELS: Record<string, { label: string; icon: string }> = {
    search_library: { label: "搜索图书馆", icon: "🔍" },
    load_full_text: { label: "加载全文", icon: "📖" },
    get_document_detail: { label: "查看文献详情", icon: "📋" },
    record_reading: { label: "记录阅读发现", icon: "✍️" },
    update_research_notes: { label: "更新研究笔记", icon: "📝" },
    remove_reference: { label: "移除参考文献", icon: "🗑️" },
};

function ToolCallCard({ tc }: { tc: ToolCall }) {
    const info = TOOL_LABELS[tc.name] || { label: tc.name, icon: "⚙️" };
    const statusClass =
        tc.status === "running"
            ? "tool-card-running"
            : tc.status === "done"
                ? "tool-card-done"
                : "tool-card-error";

    // Build description from args
    let desc = "";
    if (tc.name === "search_library" && tc.args.query) {
        desc = `关键词: ${tc.args.query}`;
        if (tc.args.discipline) desc += ` · 学科: ${tc.args.discipline}`;
        if (tc.args.type) desc += ` · 类型: ${tc.args.type}`;
    } else if (
        (tc.name === "load_full_text" || tc.name === "get_document_detail") &&
        tc.args.document_id
    ) {
        desc = `ID: ${tc.args.document_id}`;
    } else if (tc.name === "record_reading" && tc.args.document_id) {
        desc = `${tc.args.document_id}`;
        if (tc.args.key_findings) {
            const findings = String(tc.args.key_findings);
            desc = findings.length > 60 ? findings.substring(0, 60) + "..." : findings;
        }
    } else if (tc.name === "update_research_notes") {
        desc = tc.args.mode === "replace" ? "替换笔记" : "追加笔记";
    } else if (tc.name === "remove_reference" && tc.args.document_id) {
        desc = `移除: ${tc.args.document_id}`;
        if (tc.args.reason) desc = String(tc.args.reason).substring(0, 50);
    }

    return (
        <div className={`tool-call-card ${statusClass}`}>
            <div className="flex items-center gap-2">
                <span className="text-sm">{info.icon}</span>
                <span className="text-xs font-medium">{info.label}</span>
                {tc.status === "running" && (
                    <div className="tool-spinner" />
                )}
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
 * Simple Markdown rendering — handles headings, bold, italic,
 * inline code, code blocks, lists, links, and blockquotes.
 */
function renderMarkdown(text: string): React.ReactNode {
    const lines = text.split("\n");
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeLang = "";
    let codeLines: string[] = [];
    let key = 0;

    function inlineFormat(line: string): React.ReactNode {
        // Split on code backticks first to avoid formatting inside code
        const parts = line.split(/(`[^`]+`)/g);
        return parts.map((part, i) => {
            if (part.startsWith("`") && part.endsWith("`")) {
                return (
                    <code key={i} className="inline-code">
                        {part.slice(1, -1)}
                    </code>
                );
            }
            // Bold
            let processed: string | React.ReactNode = part;
            if (typeof processed === "string" && /\*\*(.+?)\*\*/g.test(processed)) {
                const segs = processed.split(/\*\*(.+?)\*\*/g);
                return segs.map((s, j) =>
                    j % 2 === 1 ? (
                        <strong key={`${i}-${j}`}>{s}</strong>
                    ) : (
                        <span key={`${i}-${j}`}>{s}</span>
                    )
                );
            }
            return <span key={i}>{processed}</span>;
        });
    }

    for (const line of lines) {
        key++;

        // Code blocks
        if (line.startsWith("```")) {
            if (inCodeBlock) {
                elements.push(
                    <pre key={key} className="code-block">
                        <div className="code-block-header">{codeLang || "code"}</div>
                        <code>{codeLines.join("\n")}</code>
                    </pre>
                );
                inCodeBlock = false;
                codeLines = [];
                codeLang = "";
            } else {
                inCodeBlock = true;
                codeLang = line.slice(3).trim();
            }
            continue;
        }

        if (inCodeBlock) {
            codeLines.push(line);
            continue;
        }

        // Empty line
        if (!line.trim()) {
            elements.push(<div key={key} className="h-2" />);
            continue;
        }

        // Headings
        if (line.startsWith("#### ")) {
            elements.push(
                <h4 key={key} className="text-sm font-semibold mt-3 mb-1">
                    {inlineFormat(line.slice(5))}
                </h4>
            );
            continue;
        }
        if (line.startsWith("### ")) {
            elements.push(
                <h3 key={key} className="text-sm font-bold mt-4 mb-1">
                    {inlineFormat(line.slice(4))}
                </h3>
            );
            continue;
        }
        if (line.startsWith("## ")) {
            elements.push(
                <h2 key={key} className="text-base font-bold mt-4 mb-2">
                    {inlineFormat(line.slice(3))}
                </h2>
            );
            continue;
        }
        if (line.startsWith("# ")) {
            elements.push(
                <h1 key={key} className="text-lg font-bold mt-4 mb-2">
                    {inlineFormat(line.slice(2))}
                </h1>
            );
            continue;
        }

        // Blockquote
        if (line.startsWith("> ")) {
            elements.push(
                <blockquote
                    key={key}
                    className="border-l-2 border-primary/30 pl-3 text-muted-foreground text-sm italic my-1"
                >
                    {inlineFormat(line.slice(2))}
                </blockquote>
            );
            continue;
        }

        // Unordered list
        if (/^[-*] /.test(line)) {
            elements.push(
                <div key={key} className="flex gap-2 text-sm my-0.5 pl-1">
                    <span className="text-muted-foreground">•</span>
                    <span>{inlineFormat(line.slice(2))}</span>
                </div>
            );
            continue;
        }

        // Ordered list
        const olMatch = line.match(/^(\d+)\.\s/);
        if (olMatch) {
            elements.push(
                <div key={key} className="flex gap-2 text-sm my-0.5 pl-1">
                    <span className="text-muted-foreground min-w-[1.2em] text-right">
                        {olMatch[1]}.
                    </span>
                    <span>{inlineFormat(line.slice(olMatch[0].length))}</span>
                </div>
            );
            continue;
        }

        // Horizontal rule
        if (/^---+$/.test(line.trim())) {
            elements.push(
                <hr key={key} className="border-border/30 my-3" />
            );
            continue;
        }

        // Normal paragraph
        elements.push(
            <p key={key} className="text-sm leading-relaxed my-0.5">
                {inlineFormat(line)}
            </p>
        );
    }

    return elements;
}

export function ChatMessage({ message }: { message: Message }) {
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

    // Agent message
    return (
        <div className="flex gap-3">
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
                {/* Tool calls */}
                {message.toolCalls && message.toolCalls.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                        {message.toolCalls.map((tc, i) => (
                            <ToolCallCard key={i} tc={tc} />
                        ))}
                    </div>
                )}

                {/* Text content */}
                {message.content && (
                    <div className="agent-bubble">{renderMarkdown(message.content)}</div>
                )}
            </div>
        </div>
    );
}
