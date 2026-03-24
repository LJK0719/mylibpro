"use client";

import { useEffect, useState, use, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CoverImage } from "@/components/CoverImage";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Heart, Download, X, Plus, Check, Pencil } from "lucide-react";

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
    status: 'unread' | 'reading' | 'read';
    is_favorite: boolean;
    shelves: string[];
}

interface Bookshelf {
    shelf_id: string;
    name: string;
    description: string;
}

// ---- Inline tag editor ----
function TagEditor({
    tags,
    onSave,
    placeholder,
    colorClass,
}: {
    tags: string[];
    onSave: (tags: string[]) => Promise<void>;
    placeholder: string;
    colorClass: string;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<string[]>(tags);
    const [input, setInput] = useState("");
    const [saving, setSaving] = useState(false);

    useEffect(() => { setDraft(tags); }, [tags]);

    const addTag = () => {
        const val = input.trim();
        if (val && !draft.includes(val)) setDraft(prev => [...prev, val]);
        setInput("");
    };

    const removeTag = (t: string) => setDraft(prev => prev.filter(x => x !== t));

    const save = async () => {
        setSaving(true);
        try { await onSave(draft); setEditing(false); } finally { setSaving(false); }
    };

    if (!editing) {
        return (
            <div className="flex flex-wrap gap-1.5 items-center group">
                {tags.length > 0
                    ? tags.map(t => <span key={t} className={`tag-chip ${colorClass}`}>{t}</span>)
                    : <span className="text-xs text-muted-foreground/50 italic">未设置</span>}
                <button
                    onClick={() => setEditing(true)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-muted-foreground hover:text-primary"
                    title="编辑"
                >
                    <Pencil className="w-3 h-3" />
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-2 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex flex-wrap gap-1.5">
                {draft.map(t => (
                    <span key={t} className={`tag-chip ${colorClass} flex items-center gap-1`}>
                        {t}
                        <button onClick={() => removeTag(t)} className="hover:text-destructive"><X className="w-2.5 h-2.5" /></button>
                    </span>
                ))}
            </div>
            <div className="flex gap-1.5">
                <Input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder={placeholder}
                    className="h-7 text-xs flex-1"
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                />
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={addTag} disabled={!input.trim()}>
                    <Plus className="w-3 h-3" />
                </Button>
            </div>
            <div className="flex gap-1.5">
                <Button size="sm" className="h-7 text-xs" onClick={save} disabled={saving}>{saving ? "保存中..." : <><Check className="w-3 h-3 mr-1" />保存</>}</Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setDraft(tags); setEditing(false); }}>取消</Button>
            </div>
        </div>
    );
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

    // Edit states
    const [isSaving, setIsSaving] = useState(false);
    const [editRemark, setEditRemark] = useState("");
    const [isEditingRemark, setIsEditingRemark] = useState(false);

    // Bookshelves
    const [allShelves, setAllShelves] = useState<Bookshelf[]>([]);
    const [shelfInput, setShelfInput] = useState("");
    const [editingShelves, setEditingShelves] = useState(false);

    useEffect(() => {
        fetch(`/api/books/${encodeURIComponent(id)}`)
            .then((r) => {
                if (!r.ok) throw new Error("Document not found");
                return r.json();
            })
            .then((data) => {
                setDoc(data);
                setEditRemark(data.remark || "");
            })
            .catch((e) => setError(e.message))
            .finally(() => setLoading(false));
    }, [id]);

    const fetchAllShelves = useCallback(async () => {
        const res = await fetch("/api/shelves");
        setAllShelves(await res.json());
    }, []);

    useEffect(() => { fetchAllShelves(); }, [fetchAllShelves]);

    const updateDoc = async (updates: Partial<DocumentView>) => {
        try {
            setIsSaving(true);
            const r = await fetch(`/api/books/${encodeURIComponent(id)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updates),
            });
            if (!r.ok) throw new Error("Failed to update");
            const updated = await r.json();
            setDoc(updated);
            if ('remark' in updates) {
                setEditRemark(updated.remark);
                setIsEditingRemark(false);
            }
        } catch (e: any) {
            alert(e.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDownload = () => {
        window.location.href = `/api/books/${encodeURIComponent(id)}/download`;
    };

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

    // Shelf helpers
    const docShelves: string[] = doc.shelves || [];
    const toggleShelf = async (shelfName: string) => {
        const next = docShelves.includes(shelfName)
            ? docShelves.filter(s => s !== shelfName)
            : [...docShelves, shelfName];
        await updateDoc({ shelves: next });
    };

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
                    {/* Download button */}
                    <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-3 gap-2 text-xs"
                        onClick={handleDownload}
                    >
                        <Download className="w-3.5 h-3.5" />
                        下载 PDF
                    </Button>
                </div>

                {/* Right: info */}
                <div className="flex-1 min-w-0">
                    {/* Title block */}
                    <div className="mb-6">
                        <div className="flex items-start gap-4 mb-2">
                            <span className="text-3xl mt-1">{doc.type === "book" ? "📚" : "📄"}</span>
                            <div className="flex-1">
                                <div className="flex items-start justify-between gap-4">
                                    <h1 className="text-2xl font-bold text-foreground leading-tight mb-2">
                                        {doc.title}
                                    </h1>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => updateDoc({ is_favorite: !doc.is_favorite })}
                                            disabled={isSaving}
                                            className="p-1.5 hover:bg-muted rounded-full transition-colors flex-shrink-0"
                                            title={doc.is_favorite ? "取消收藏" : "收藏"}
                                        >
                                            <Heart
                                                className={`w-5 h-5 transition-colors ${doc.is_favorite ? 'fill-red-500 text-red-500' : 'text-muted-foreground hover:text-red-500'}`}
                                            />
                                        </button>
                                        <div className="w-[100px]">
                                            <Select
                                                disabled={isSaving}
                                                value={doc.status || "unread"}
                                                onValueChange={(val) => updateDoc({ status: val as any })}
                                            >
                                                <SelectTrigger className="h-8 text-xs font-medium">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="unread">未读</SelectItem>
                                                    <SelectItem value="reading">在读</SelectItem>
                                                    <SelectItem value="read">已读</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </div>
                                <p className="text-base text-muted-foreground mt-1">
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

                    {/* Tags — editable */}
                    <div className="space-y-3 mb-6">
                        <div className="flex items-start gap-2">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1 mt-1.5 flex-shrink-0">学科</span>
                            <TagEditor
                                tags={doc.discipline}
                                placeholder="添加学科，按回车确认"
                                colorClass="tag-chip-discipline"
                                onSave={async (tags) => { await updateDoc({ discipline: tags }); }}
                            />
                        </div>
                        <div className="flex items-start gap-2">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1 mt-1.5 flex-shrink-0">子领域</span>
                            <TagEditor
                                tags={doc.subdiscipline}
                                placeholder="添加子领域，按回车确认"
                                colorClass="tag-chip-subdiscipline"
                                onSave={async (tags) => { await updateDoc({ subdiscipline: tags }); }}
                            />
                        </div>
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

                    {/* Bookshelves */}
                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-2">
                            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">桌面书架</h2>
                            <Button
                                variant="ghost" size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={() => setEditingShelves(!editingShelves)}
                            >
                                {editingShelves ? "完成" : "管理"}
                            </Button>
                        </div>

                        {docShelves.length > 0 && !editingShelves && (
                            <div className="flex flex-wrap gap-1.5">
                                {docShelves.map(s => (
                                    <span key={s} className="tag-chip" style={{ background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--border)" }}>
                                        📚 {s}
                                    </span>
                                ))}
                            </div>
                        )}

                        {editingShelves && (
                            <div className="p-3 rounded-xl bg-muted/30 border border-border/50 space-y-2 animate-in fade-in zoom-in-95 duration-200">
                                {allShelves.length === 0 ? (
                                    <p className="text-xs text-muted-foreground text-center py-2">
                                        还没有书架，请先在主页创建书架
                                    </p>
                                ) : (
                                    <div className="space-y-1">
                                        {allShelves.map(shelf => {
                                            const checked = docShelves.includes(shelf.name);
                                            return (
                                                <button
                                                    key={shelf.shelf_id}
                                                    onClick={() => toggleShelf(shelf.name)}
                                                    disabled={isSaving}
                                                    className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors flex items-center gap-2 ${
                                                        checked
                                                            ? "bg-primary/10 text-primary font-medium"
                                                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                                                    }`}
                                                >
                                                    <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${checked ? "bg-primary border-primary" : "border-border"}`}>
                                                        {checked && <Check className="w-2 h-2 text-white" />}
                                                    </div>
                                                    <span className="flex-1 truncate">📚 {shelf.name}</span>
                                                    {shelf.description && (
                                                        <span className="text-[10px] text-muted-foreground/60 truncate max-w-[120px]">{shelf.description}</span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {!editingShelves && docShelves.length === 0 && (
                            <div
                                className="text-xs text-muted-foreground/50 italic border border-dashed border-border rounded-xl p-3 text-center cursor-pointer hover:bg-muted/30 transition-colors"
                                onClick={() => setEditingShelves(true)}
                            >
                                未加入任何书架，点击管理...
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
            <section className="mb-8">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">备注</h2>
                    {!isEditingRemark && (
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setIsEditingRemark(true)} disabled={loading}>
                            {doc.remark ? "编辑" : "添加备注"}
                        </Button>
                    )}
                </div>

                {isEditingRemark ? (
                    <div className="space-y-3 animate-in fade-in zoom-in-95 duration-200">
                        <textarea
                            className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder="在这写点你的心得和笔记..."
                            value={editRemark}
                            onChange={e => setEditRemark(e.target.value)}
                            disabled={isSaving}
                        />
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => { setIsEditingRemark(false); setEditRemark(doc.remark || ""); }} disabled={isSaving}>取消</Button>
                            <Button size="sm" onClick={() => updateDoc({ remark: editRemark })} disabled={isSaving}>
                                {isSaving ? "保存中..." : "保存"}
                            </Button>
                        </div>
                    </div>
                ) : (
                    doc.remark ? (
                        <div className="text-sm text-foreground/85 filter-sidebar rounded-xl p-5 whitespace-pre-line leading-relaxed border border-transparent hover:border-border transition-colors cursor-pointer" onClick={() => setIsEditingRemark(true)}>
                            {doc.remark}
                        </div>
                    ) : (
                        <div className="text-sm text-muted-foreground/60 italic border border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:bg-muted/50 hover:text-muted-foreground transition-colors" onClick={() => setIsEditingRemark(true)}>
                            暂无备注，点击添加...
                        </div>
                    )
                )}
            </section>

            {/* Back */}
            <div className="mt-6">
                <Link href="/">
                    <Button variant="outline" size="sm">← 返回文献库</Button>
                </Link>
            </div>
        </div>
    );
}
