"use client";

import { useEffect, useState, use, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CoverImage } from "@/components/library/CoverImage";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Heart, Download, X, Plus, Check, Pencil, RefreshCw } from "lucide-react";
import { loadSettings } from "@/lib/agent/storage";
import type { DocumentView, Bookshelf } from "@/lib/types/library";
import { useLanguage } from "@/components/common/LanguageProvider";
import { pickArray, pickText } from "@/lib/i18n";

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
    const { t } = useLanguage();
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
                    : <span className="text-xs text-muted-foreground/50 italic">{t("detail.notSet")}</span>}
                <button
                    onClick={() => setEditing(true)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-muted-foreground hover:text-primary"
                    title={t("detail.edit")}
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
                <Button size="sm" className="h-7 text-xs" onClick={save} disabled={saving}>{saving ? t("detail.saving") : <><Check className="w-3 h-3 mr-1" />{t("detail.save")}</>}</Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setDraft(tags); setEditing(false); }}>{t("library.cancel")}</Button>
            </div>
        </div>
    );
}

export default function BookDetailPageClient({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { language, t } = useLanguage();
    const { id } = use(params);
    const [doc, setDoc] = useState<DocumentView | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tocExpanded, setTocExpanded] = useState(false);

    // Edit states
    const [isSaving, setIsSaving] = useState(false);
    const [regeneratingField, setRegeneratingField] = useState<"abstract" | "toc" | null>(null);
    const [editRemark, setEditRemark] = useState("");
    const [isEditingRemark, setIsEditingRemark] = useState(false);

    // Bookshelves
    const [allShelves, setAllShelves] = useState<Bookshelf[]>([]);
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
        } catch (e: unknown) {
            alert(e instanceof Error ? e.message : "Failed to update");
        } finally {
            setIsSaving(false);
        }
    };

    const regenerateField = async (field: "abstract" | "toc") => {
        try {
            setRegeneratingField(field);
            const settings = loadSettings();
            const r = await fetch(`/api/books/${encodeURIComponent(id)}/regenerate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    field,
                    provider: settings.provider,
                    model: settings.model,
                    baseUrl: settings.provider === "openai" ? settings.baseUrl : undefined,
                }),
            });

            const data = await r.json();
            if (!r.ok) {
                throw new Error(data.error || "Failed to regenerate");
            }
            if (data.document) {
                setDoc(data.document);
            }
        } catch (e: unknown) {
            alert(e instanceof Error ? e.message : "Failed to regenerate");
        } finally {
            setRegeneratingField(null);
        }
    };

    const handleDownload = (format: "pdf" | "markdown") => {
        window.location.href = `/api/books/${encodeURIComponent(id)}/download?format=${format}`;
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
                    <Button variant="outline" size="sm">← {t("detail.back")}</Button>
                </Link>
            </div>
        );
    }

    const title = pickText(doc.metadata_i18n?.title, language, doc.title);
    const authors = pickArray(doc.metadata_i18n?.authors, language, doc.authors);
    const discipline = pickArray(doc.metadata_i18n?.discipline, language, doc.discipline);
    const subdiscipline = pickArray(doc.metadata_i18n?.subdiscipline, language, doc.subdiscipline);
    const keywords = pickArray(doc.metadata_i18n?.keywords, language, doc.keywords);
    const abstract = pickText(doc.metadata_i18n?.abstract, language, doc.abstract);
    const toc = pickText(doc.metadata_i18n?.toc, language, doc.toc);
    const typeLabel = doc.type === "book" ? `📚 ${t("library.book")}` : doc.type === "paper" ? `📄 ${t("library.paper")}` : doc.type;
    const tocLines = toc ? toc.split("\n") : [];
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
                    {t("detail.library")}
                </Link>
                <span>/</span>
                <span className="text-foreground/70 truncate max-w-[300px]">{title}</span>
            </nav>

            <div className="flex flex-col lg:flex-row gap-8">
                {/* Left: PDF cover */}
                <div className="lg:w-[280px] flex-shrink-0">
                    <CoverImage folderName={doc.folder_name} title={title} className="shadow-lg rounded-lg" />
                    <div className="grid grid-cols-2 gap-2 mt-3">
                        <Button
                            variant="outline"
                            size="sm"
                            className="gap-2 text-xs"
                            onClick={() => handleDownload("pdf")}
                        >
                            <Download className="w-3.5 h-3.5" />
                            PDF
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="gap-2 text-xs"
                            onClick={() => handleDownload("markdown")}
                        >
                            <Download className="w-3.5 h-3.5" />
                            Markdown
                        </Button>
                    </div>
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
                                        {title}
                                    </h1>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => updateDoc({ is_favorite: !doc.is_favorite })}
                                            disabled={isSaving}
                                            className="p-1.5 hover:bg-muted rounded-full transition-colors flex-shrink-0"
                                            title={doc.is_favorite ? t("detail.unfavorite") : t("detail.favorite")}
                                        >
                                            <Heart
                                                className={`w-5 h-5 transition-colors ${doc.is_favorite ? 'fill-red-500 text-red-500' : 'text-muted-foreground hover:text-red-500'}`}
                                            />
                                        </button>
                                        <div className="w-[100px]">
                                            <Select
                                                disabled={isSaving}
                                                value={doc.status || "unread"}
                                                onValueChange={(val) => updateDoc({ status: val as DocumentView["status"] })}
                                            >
                                                <SelectTrigger className="h-8 text-xs font-medium">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="unread">{t("library.unread")}</SelectItem>
                                                    <SelectItem value="reading">{t("library.reading")}</SelectItem>
                                                    <SelectItem value="read">{t("library.read")}</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-1">
                                    <TagEditor
                                        tags={authors}
                                        placeholder="Add author and press Enter"
                                        colorClass="tag-chip-neutral"
                                        onSave={async (tags) => { await updateDoc({ authors: tags }); }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Meta */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                        {[
                            { label: t("library.type"), value: typeLabel },
                            { label: t("detail.year"), value: String(doc.year) },
                            { label: t("detail.length"), value: `${doc.token_count.toLocaleString()} tokens` },
                            { label: t("detail.indexedDate"), value: doc.indexed_date ? new Date(doc.indexed_date).toLocaleDateString(language === "zh" ? "zh-CN" : "en-US") : "—" },
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
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1 mt-1.5 flex-shrink-0">{t("library.discipline")}</span>
                            <TagEditor
                                tags={discipline}
                                placeholder="Add discipline and press Enter"
                                colorClass="tag-chip-discipline"
                                onSave={async (tags) => { await updateDoc({ discipline: tags }); }}
                            />
                        </div>
                        <div className="flex items-start gap-2">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1 mt-1.5 flex-shrink-0">{t("library.subdiscipline")}</span>
                            <TagEditor
                                tags={subdiscipline}
                                placeholder="Add subdiscipline and press Enter"
                                colorClass="tag-chip-subdiscipline"
                                onSave={async (tags) => { await updateDoc({ subdiscipline: tags }); }}
                            />
                        </div>
                        <div className="flex items-start gap-2">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1 mt-1.5 flex-shrink-0">{t("detail.keywords")}</span>
                            <TagEditor
                                tags={keywords}
                                placeholder="Add keyword and press Enter"
                                colorClass="tag-chip-neutral"
                                onSave={async (tags) => { await updateDoc({ keywords: tags }); }}
                            />
                        </div>
                    </div>

                    {/* Bookshelves */}
                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-2">
                            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("library.bookshelves")}</h2>
                            <Button
                                variant="ghost" size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={() => setEditingShelves(!editingShelves)}
                            >
                                {editingShelves ? t("detail.done") : t("detail.manage")}
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
                                Not assigned to any shelf. Click Manage.
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <Separator className="my-8" />

            {/* Abstract */}
            <section className="mb-8">
                <div className="flex items-center justify-between gap-3 mb-3">
                    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {t("detail.abstract")}
                    </h2>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1.5"
                        onClick={() => regenerateField("abstract")}
                        disabled={regeneratingField !== null}
                    >
                        <RefreshCw className={`w-3 h-3 ${regeneratingField === "abstract" ? "animate-spin" : ""}`} />
                        {regeneratingField === "abstract" ? "Generating..." : "Regenerate abstract"}
                    </Button>
                </div>
                {abstract ? (
                    <div className="text-sm text-foreground/85 leading-relaxed whitespace-pre-line filter-sidebar rounded-xl p-5">
                        {abstract}
                    </div>
                ) : (
                    <div className="text-sm text-muted-foreground/60 italic border border-dashed border-border rounded-xl p-6 text-center">
                        {t("detail.noAbstract")}
                    </div>
                )}
            </section>

            {/* TOC */}
            <section className="mb-8">
                <div className="flex items-center justify-between gap-3 mb-3">
                    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {t("detail.toc")}
                    </h2>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1.5"
                        onClick={() => regenerateField("toc")}
                        disabled={regeneratingField !== null}
                    >
                        <RefreshCw className={`w-3 h-3 ${regeneratingField === "toc" ? "animate-spin" : ""}`} />
                        {regeneratingField === "toc" ? "Generating..." : "Regenerate TOC"}
                    </Button>
                </div>
                {tocLines.length > 0 ? (
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
                ) : (
                    <div className="text-sm text-muted-foreground/60 italic border border-dashed border-border rounded-xl p-6 text-center">
                        {t("detail.noToc")}
                    </div>
                )}
            </section>

            {/* Remark */}
            <section className="mb-8">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("detail.remark")}</h2>
                    {!isEditingRemark && (
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setIsEditingRemark(true)} disabled={loading}>
                            {doc.remark ? t("detail.edit") : t("detail.addRemark")}
                        </Button>
                    )}
                </div>

                {isEditingRemark ? (
                    <div className="space-y-3 animate-in fade-in zoom-in-95 duration-200">
                        <textarea
                            className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder="Write notes or remarks..."
                            value={editRemark}
                            onChange={e => setEditRemark(e.target.value)}
                            disabled={isSaving}
                        />
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => { setIsEditingRemark(false); setEditRemark(doc.remark || ""); }} disabled={isSaving}>{t("library.cancel")}</Button>
                            <Button size="sm" onClick={() => updateDoc({ remark: editRemark })} disabled={isSaving}>
                                {isSaving ? t("detail.saving") : t("detail.save")}
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
                            {t("detail.noRemark")}
                        </div>
                    )
                )}
            </section>

            {/* Back */}
            <div className="mt-6">
                <Link href="/">
                    <Button variant="outline" size="sm">← {t("detail.back")}</Button>
                </Link>
            </div>
        </div>
    );
}
