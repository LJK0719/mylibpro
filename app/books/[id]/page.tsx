"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CoverImage } from "@/components/CoverImage";

interface DocumentView {
    document_id: string;
    type: string;
    title: string;
    authors: string[];
    year: number;
    discipline: string[];
    subdiscipline: string[];
    keywords: string[];
    abstract: string;
    toc: string;
    full_text_path: string;
    token_count: number;
    indexed_date: string;
    citation_info: string;
    remark: string;
    folder_name: string;
}

export default function BookDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = use(params);
    const [doc, setDoc] = useState<DocumentView | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tocExpanded, setTocExpanded] = useState(false);

    useEffect(() => {
        fetch(`/api/books/${encodeURIComponent(id)}`)
            .then((r) => {
                if (!r.ok) throw new Error("Document not found");
                return r.json();
            })
            .then(setDoc)
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, [id]);

    if (loading) {
        return (
            <div className="max-w-4xl mx-auto px-6 py-12">
                <div className="animate-pulse space-y-6">
                    <div className="h-8 bg-muted rounded w-3/4" />
                    <div className="h-4 bg-muted rounded w-1/3" />
                    <div className="h-32 bg-muted rounded" />
                </div>
            </div>
        );
    }

    if (error || !doc) {
        return (
            <div className="max-w-4xl mx-auto px-6 py-20 text-center">
                <div className="text-5xl mb-3">📭</div>
                <h2 className="text-xl font-semibold mb-2">未找到文献</h2>
                <p className="text-sm text-muted-foreground mb-4">{error}</p>
                <Link href="/">
                    <Button variant="outline" size="sm">← 返回文献库</Button>
                </Link>
            </div>
        );
    }

    const typeLabel = doc.type === "book" ? "📚 图书" : doc.type === "paper" ? "📄 论文" : doc.type;
    const tocLines = doc.toc ? doc.toc.split("\n") : [];
    const tocPreview = tocLines.slice(0, 20);
    const hasMoreToc = tocLines.length > 20;

    return (
        <div className="max-w-5xl mx-auto px-6 py-8">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-2 text-xs text-muted-foreground mb-6">
                <Link href="/" className="hover:text-foreground transition-colors">
                    文献库
                </Link>
                <span>/</span>
                <span className="text-foreground/70 truncate max-w-[300px]">{doc.title}</span>
            </nav>

            <div className="flex flex-col lg:flex-row gap-8">
                {/* Left: PDF cover */}
                <div className="lg:w-[280px] flex-shrink-0">
                    <CoverImage folderName={doc.folder_name} title={doc.title} className="shadow-lg rounded-lg" />
                </div>

                {/* Right: info */}
                <div className="flex-1 min-w-0">
                    {/* Title block */}
                    <div className="mb-6">
                        <div className="flex items-start gap-3 mb-2">
                            <span className="text-3xl">{doc.type === "book" ? "📚" : "📄"}</span>
                            <div>
                                <h1 className="text-2xl font-bold text-foreground leading-tight mb-2">
                                    {doc.title}
                                </h1>
                                <p className="text-base text-muted-foreground">
                                    {doc.authors.join(", ")}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Meta */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                        {[
                            { label: "类型", value: typeLabel },
                            { label: "年份", value: String(doc.year) },
                            { label: "篇幅", value: `${doc.token_count.toLocaleString()} tokens` },
                            { label: "索引日期", value: doc.indexed_date ? new Date(doc.indexed_date).toLocaleDateString("zh-CN") : "—" },
                        ].map(({ label, value }) => (
                            <div key={label} className="stat-card rounded-lg p-3">
                                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">{label}</div>
                                <div className="text-sm font-medium">{value}</div>
                            </div>
                        ))}
                    </div>

                    {/* Tags */}
                    <div className="space-y-3 mb-6">
                        <div className="flex flex-wrap gap-1.5 items-center">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-2">学科</span>
                            {doc.discipline.map((d) => (
                                <span key={d} className="tag-chip tag-chip-discipline">{d}</span>
                            ))}
                        </div>
                        {doc.subdiscipline.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 items-center">
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-2">子领域</span>
                                {doc.subdiscipline.map((s) => (
                                    <span key={s} className="tag-chip tag-chip-subdiscipline">{s}</span>
                                ))}
                            </div>
                        )}
                        {doc.keywords.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 items-center">
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-2">关键词</span>
                                {doc.keywords.map((k) => (
                                    <span key={k} className="tag-chip" style={{
                                        background: "var(--muted)",
                                        color: "var(--muted-foreground)",
                                        border: "1px solid var(--border)"
                                    }}>{k}</span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <Separator className="my-8" />

            {/* Abstract */}
            {doc.abstract && (
                <section className="mb-8">
                    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                        摘要
                    </h2>
                    <div className="text-sm text-foreground/85 leading-relaxed whitespace-pre-line filter-sidebar rounded-xl p-5">
                        {doc.abstract}
                    </div>
                </section>
            )}

            {/* TOC */}
            {tocLines.length > 0 && (
                <section className="mb-8">
                    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                        目录
                    </h2>
                    <div className="filter-sidebar rounded-xl p-5 font-mono text-sm space-y-0.5">
                        {(tocExpanded ? tocLines : tocPreview).map((line, i) => {
                            const indent = line.match(/^(\s*)/)?.[1]?.length ?? 0;
                            const isChapter = /^(Chapter|Part|Appendix)/i.test(line.trim());
                            return (
                                <div
                                    key={i}
                                    style={{ paddingLeft: `${Math.min(indent, 6) * 12}px` }}
                                    className={`py-0.5 ${isChapter ? "font-semibold text-foreground" : "text-muted-foreground"
                                        }`}
                                >
                                    {line.trim()}
                                </div>
                            );
                        })}
                        {hasMoreToc && (
                            <Button
                                variant="ghost" size="sm"
                                onClick={() => setTocExpanded(!tocExpanded)}
                                className="mt-3 text-primary text-xs"
                            >
                                {tocExpanded ? "收起 ↑" : `展开全部 (${tocLines.length} 行) ↓`}
                            </Button>
                        )}
                    </div>
                </section>
            )}

            {/* Remark */}
            {doc.remark && (
                <section className="mb-8">
                    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">备注</h2>
                    <p className="text-sm text-foreground/85 filter-sidebar rounded-xl p-5">{doc.remark}</p>
                </section>
            )}

            {/* Back */}
            <div className="mt-6">
                <Link href="/">
                    <Button variant="outline" size="sm">← 返回文献库</Button>
                </Link>
            </div>
        </div>
    );
}
