"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookCard } from "@/components/BookCard";

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
  token_count: number;
  folder_name: string;
}

interface FiltersData {
  disciplines: string[];
  subdisciplines: string[];
  types: string[];
  yearRange: { min: number; max: number };
}

type ViewMode = "grid" | "list" | "cover";

export default function HomePage() {
  const [documents, setDocuments] = useState<DocumentView[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filtersData, setFiltersData] = useState<FiltersData | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedDiscipline, setSelectedDiscipline] = useState("");
  const [selectedSubdiscipline, setSelectedSubdiscipline] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [sortBy, setSortBy] = useState("year_desc");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const pageSize = viewMode === "cover" ? 8 : viewMode === "list" ? 15 : 12;

  // Debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load filters
  useEffect(() => {
    fetch("/api/disciplines")
      .then((r) => r.json())
      .then(setFiltersData)
      .catch(console.error);
  }, []);

  // Load documents
  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (selectedDiscipline) params.set("discipline", selectedDiscipline);
    if (selectedSubdiscipline) params.set("subdiscipline", selectedSubdiscipline);
    if (selectedType) params.set("type", selectedType);
    params.set("sort", sortBy);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));

    try {
      const res = await fetch(`/api/books?${params.toString()}`);
      const data = await res.json();
      setDocuments(data.documents);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch (err) {
      console.error("Failed to fetch:", err);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, selectedDiscipline, selectedSubdiscipline, selectedType, sortBy, page, pageSize]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const clearFilters = () => {
    setSearchQuery("");
    setDebouncedQuery("");
    setSelectedDiscipline("");
    setSelectedSubdiscipline("");
    setSelectedType("");
    setSortBy("year_desc");
    setPage(1);
  };

  const hasFilters =
    debouncedQuery || selectedDiscipline || selectedSubdiscipline || selectedType;

  // Grid classes per view mode
  const gridClass =
    viewMode === "cover"
      ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5"
      : viewMode === "list"
        ? "flex flex-col gap-2"
        : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5";

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8">
      {/* ===== HERO ===== */}
      <div className="mb-8">
        <div className="flex items-end justify-between mb-1">
          <div>
            <h1 className="text-3xl font-bold gradient-text mb-1">My Library</h1>
            <p className="text-muted-foreground text-sm">
              {total} 部文献 · {filtersData?.disciplines.length ?? 0} 个学科 · {filtersData?.yearRange ? `${filtersData.yearRange.min}–${filtersData.yearRange.max}` : ""}
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-6">
        {/* ===== SIDEBAR ===== */}
        <aside className="hidden lg:block w-[220px] flex-shrink-0">
          <div className="filter-sidebar p-4 sticky top-[72px] space-y-5">
            {/* Search */}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
                搜索
              </label>
              <div className="relative">
                <svg
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                  width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                </svg>
                <Input
                  placeholder="书名、作者、关键词"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-9 text-sm bg-background/50"
                />
              </div>
            </div>

            {/* Type */}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
                类型
              </label>
              <Select value={selectedType} onValueChange={(v) => { setSelectedType(v === "all" ? "" : v); setPage(1); }}>
                <SelectTrigger className="h-9 text-sm bg-background/50">
                  <SelectValue placeholder="全部类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部类型</SelectItem>
                  {filtersData?.types.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t === "book" ? "📚 图书" : t === "paper" ? "📄 论文" : t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Discipline */}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
                学科
              </label>
              <div className="space-y-1 max-h-[180px] overflow-y-auto pr-1">
                <button
                  onClick={() => { setSelectedDiscipline(""); setPage(1); }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors ${!selectedDiscipline
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                >
                  全部学科
                </button>
                {filtersData?.disciplines.map((d) => (
                  <button
                    key={d}
                    onClick={() => { setSelectedDiscipline(d); setPage(1); }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors ${selectedDiscipline === d
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* Subdiscipline */}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
                子领域
              </label>
              <div className="space-y-1 max-h-[240px] overflow-y-auto pr-1">
                <button
                  onClick={() => { setSelectedSubdiscipline(""); setPage(1); }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors ${!selectedSubdiscipline
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                >
                  全部子领域
                </button>
                {filtersData?.subdisciplines.map((s) => (
                  <button
                    key={s}
                    onClick={() => { setSelectedSubdiscipline(s); setPage(1); }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors ${selectedSubdiscipline === s
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Sort */}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
                排序
              </label>
              <Select value={sortBy} onValueChange={(v) => { setSortBy(v); setPage(1); }}>
                <SelectTrigger className="h-9 text-sm bg-background/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="year_desc">最新优先</SelectItem>
                  <SelectItem value="year_asc">最早优先</SelectItem>
                  <SelectItem value="title_asc">书名 A→Z</SelectItem>
                  <SelectItem value="title_desc">书名 Z→A</SelectItem>
                  <SelectItem value="token_desc">篇幅最大</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Clear */}
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="w-full text-xs text-muted-foreground hover:text-foreground"
              >
                清除所有筛选
              </Button>
            )}
          </div>
        </aside>

        {/* ===== MAIN CONTENT ===== */}
        <div className="flex-1 min-w-0">
          {/* Toolbar: mobile search + view toggle */}
          <div className="flex items-center justify-between mb-5">
            {/* Mobile search (lg: hidden) */}
            <div className="lg:hidden flex-1 mr-3">
              <Input
                placeholder="搜索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            {/* Active filters */}
            {hasFilters && (
              <div className="hidden lg:flex items-center gap-2 flex-1">
                {debouncedQuery && (
                  <span className="tag-chip tag-chip-discipline flex items-center gap-1">
                    搜索: {debouncedQuery}
                    <button onClick={() => setSearchQuery("")} className="hover:text-destructive">✕</button>
                  </span>
                )}
                {selectedDiscipline && (
                  <span className="tag-chip tag-chip-discipline flex items-center gap-1">
                    {selectedDiscipline}
                    <button onClick={() => setSelectedDiscipline("")} className="hover:text-destructive">✕</button>
                  </span>
                )}
                {selectedSubdiscipline && (
                  <span className="tag-chip tag-chip-subdiscipline flex items-center gap-1">
                    {selectedSubdiscipline}
                    <button onClick={() => setSelectedSubdiscipline("")} className="hover:text-destructive">✕</button>
                  </span>
                )}
                {selectedType && (
                  <span className="tag-chip tag-chip-discipline flex items-center gap-1">
                    {selectedType === "book" ? "图书" : "论文"}
                    <button onClick={() => setSelectedType("")} className="hover:text-destructive">✕</button>
                  </span>
                )}
                <span className="text-xs text-muted-foreground ml-1">{total} 条结果</span>
              </div>
            )}

            {/* View toggle */}
            <div className="flex items-center bg-muted/50 rounded-xl p-1 ml-auto flex-shrink-0">
              <button
                onClick={() => { setViewMode("grid"); setPage(1); }}
                className={`view-btn ${viewMode === "grid" ? "active" : ""}`}
                title="网格视图"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
                </svg>
                <span className="text-xs hidden sm:inline">网格</span>
              </button>
              <button
                onClick={() => { setViewMode("list"); setPage(1); }}
                className={`view-btn ${viewMode === "list" ? "active" : ""}`}
                title="列表视图"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
                <span className="text-xs hidden sm:inline">列表</span>
              </button>
              <button
                onClick={() => { setViewMode("cover"); setPage(1); }}
                className={`view-btn ${viewMode === "cover" ? "active" : ""}`}
                title="封面视图"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                </svg>
                <span className="text-xs hidden sm:inline">封面</span>
              </button>
            </div>
          </div>

          {/* Results */}
          {loading ? (
            <div className={gridClass}>
              {Array.from({ length: viewMode === "list" ? 5 : 6 }).map((_, i) => (
                <div
                  key={i}
                  className={`rounded-xl animate-pulse ${viewMode === "list"
                    ? "book-card p-4 h-16"
                    : viewMode === "cover"
                      ? "book-cover-card h-72"
                      : "book-card p-5 h-52"
                    }`}
                >
                  <div className="h-4 bg-muted rounded w-3/4 mb-3" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-20">
              <div className="text-5xl mb-3">📭</div>
              <h3 className="text-lg font-semibold mb-1">未找到文献</h3>
              <p className="text-sm text-muted-foreground mb-4">尝试调整搜索条件或清除筛选</p>
              <Button variant="outline" size="sm" onClick={clearFilters}>
                清除筛选
              </Button>
            </div>
          ) : (
            <div className={gridClass}>
              {documents.map((doc) => (
                <BookCard key={doc.document_id} doc={doc} viewMode={viewMode} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1.5 mt-8">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="h-8 px-3 text-xs"
              >
                ←
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => {
                  if (totalPages <= 7) return true;
                  return p === 1 || p === totalPages || Math.abs(p - page) <= 1;
                })
                .map((p, idx, arr) => {
                  const prev = arr[idx - 1];
                  const showEllipsis = prev !== undefined && p - prev > 1;
                  return (
                    <span key={p} className="flex items-center">
                      {showEllipsis && <span className="px-1 text-muted-foreground text-xs">…</span>}
                      <Button
                        variant={p === page ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setPage(p)}
                        className={`h-8 w-8 p-0 text-xs ${p !== page ? "text-muted-foreground" : ""
                          }`}
                      >
                        {p}
                      </Button>
                    </span>
                  );
                })}
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="h-8 px-3 text-xs"
              >
                →
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
