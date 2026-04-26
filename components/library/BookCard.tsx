"use client";

import Link from "next/link";
import { CoverImage } from "@/components/library/CoverImage";
import type { DocumentView } from "@/lib/types/library";
import { useLanguage } from "@/components/common/LanguageProvider";
import { pickArray, pickText } from "@/lib/i18n";

type ViewMode = "grid" | "list" | "cover";

export function BookCard({ doc, viewMode = "grid" }: { doc: DocumentView; viewMode?: ViewMode }) {
    const { language } = useLanguage();
    const typeEmoji = doc.type === "book" ? "📚" : doc.type === "paper" ? "📄" : "📁";
    const title = pickText(doc.metadata_i18n?.title, language, doc.title);
    const authors = pickArray(doc.metadata_i18n?.authors, language, doc.authors);
    const discipline = pickArray(doc.metadata_i18n?.discipline, language, doc.discipline);
    const subdiscipline = pickArray(doc.metadata_i18n?.subdiscipline, language, doc.subdiscipline);
    const abstract = pickText(doc.metadata_i18n?.abstract, language, doc.abstract);

    if (viewMode === "cover") {
        return (
            <Link href={`/books/${encodeURIComponent(doc.document_id)}`}>
                <div className="book-cover-card rounded-xl cursor-pointer group flex flex-col">
                    {/* Static Cover Image */}
                    <div className="relative aspect-[3/4] bg-muted/30 rounded-t-xl overflow-hidden">
                        <CoverImage folderName={doc.folder_name} title={title} fill />
                    </div>

                    {/* Info */}
                    <div className="p-4 flex-1 flex flex-col">
                        <h3 className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug mb-1.5">
                            {title}
                        </h3>
                        <p className="text-xs text-muted-foreground line-clamp-1 mb-2">
                            {authors.join(", ")}
                        </p>
                        <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground">
                            <span className="font-medium">{doc.year}</span>
                            <div className="flex gap-1">
                                {discipline.slice(0, 1).map((d) => (
                                    <span key={d} className="tag-chip tag-chip-discipline">{d}</span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </Link>
        );
    }

    if (viewMode === "list") {
        return (
            <Link href={`/books/${encodeURIComponent(doc.document_id)}`}>
                <div className="book-card rounded-xl p-4 cursor-pointer group flex items-center gap-5">
                    {/* Left: type + year */}
                    <div className="flex flex-col items-center flex-shrink-0 w-14">
                        <span className="text-2xl">{typeEmoji}</span>
                        <span className="text-xs text-muted-foreground font-medium mt-1">{doc.year}</span>
                    </div>

                    {/* Middle: title + authors */}
                    <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1 text-sm mb-1">
                            {title}
                        </h3>
                        <p className="text-xs text-muted-foreground line-clamp-1 mb-2">
                            {authors.join(", ")}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {discipline.map((d) => (
                                <span key={d} className="tag-chip tag-chip-discipline">{d}</span>
                            ))}
                            {subdiscipline.slice(0, 2).map((s) => (
                                <span key={s} className="tag-chip tag-chip-subdiscipline">{s}</span>
                            ))}
                        </div>
                    </div>

                    {/* Right: tokens */}
                    <div className="flex-shrink-0 text-right hidden sm:block">
                        <div className="text-xs text-muted-foreground">
                            {doc.token_count > 1000
                                ? `${(doc.token_count / 1000).toFixed(0)}K`
                                : doc.token_count} tokens
                        </div>
                    </div>
                </div>
            </Link>
        );
    }

    // Default: grid view
    return (
        <Link href={`/books/${encodeURIComponent(doc.document_id)}`}>
            <div className="book-card rounded-xl p-5 cursor-pointer group h-full flex flex-col">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                    <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug text-[15px] flex-1">
                        {title}
                    </h3>
                    <span className="text-lg flex-shrink-0" title={doc.type}>{typeEmoji}</span>
                </div>

                {/* Authors */}
                <p className="text-sm text-muted-foreground mb-2 line-clamp-1">
                    {authors.join(", ")}
                </p>

                {/* Abstract */}
                <p className="text-xs text-muted-foreground/70 mb-4 line-clamp-3 flex-1 leading-relaxed">
                    {abstract}
                </p>

                {/* Tags */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                    {discipline.map((d) => (
                        <span key={d} className="tag-chip tag-chip-discipline">{d}</span>
                    ))}
                    {subdiscipline.slice(0, 2).map((s) => (
                        <span key={s} className="tag-chip tag-chip-subdiscipline">{s}</span>
                    ))}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-border/50">
                    <span className="font-semibold">{doc.year}</span>
                    <span>
                        {doc.token_count > 1000
                            ? `${(doc.token_count / 1000).toFixed(0)}K tokens`
                            : `${doc.token_count} tokens`}
                    </span>
                </div>
            </div>
        </Link>
    );
}
