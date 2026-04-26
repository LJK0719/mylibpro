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
import { BookCard } from "@/components/library/BookCard";
import { Heart, BookOpen, BookCheck, BookMarked, Library, Plus, Trash2, Pencil, Check, X, ChevronDown, ChevronRight, RefreshCw, FileText } from "lucide-react";
import type { DocumentView, Bookshelf } from "@/lib/types/library";
import { useLanguage } from "@/components/common/LanguageProvider";

interface FilterOption {
  value: string;
  label: {
    en: string;
    zh: string;
  };
}

interface FiltersData {
  disciplines: FilterOption[];
  subdisciplines: FilterOption[];
  types: string[];
  yearRange: { min: number; max: number };
}

type ViewMode = "grid" | "list" | "cover";
type DocumentTypeView = "book" | "paper";
type QuickFilter = "" | "favorite" | "reading" | "read" | "unread";

const LIBRARY_UI_STATE_KEY = "mylibpro.library.uiState";

interface LibraryUiState {
  searchQuery: string;
  selectedDiscipline: string;
  selectedSubdiscipline: string;
  activeType: DocumentTypeView;
  selectedType?: string;
  sortBy: string;
  quickFilter: QuickFilter;
  selectedShelf: string;
}

function isDocumentTypeView(value: unknown): value is DocumentTypeView {
  return value === "book" || value === "paper";
}

function isQuickFilter(value: unknown): value is QuickFilter {
  return value === "" || value === "favorite" || value === "reading" || value === "read" || value === "unread";
}

export default function LibraryPageClient() {
  const { t, language } = useLanguage();
  const [documents, setDocuments] = useState<DocumentView[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filtersData, setFiltersData] = useState<FiltersData | null>(null);
  const [uiStateHydrated, setUiStateHydrated] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedDiscipline, setSelectedDiscipline] = useState("");
  const [selectedSubdiscipline, setSelectedSubdiscipline] = useState("");
  const [activeType, setActiveType] = useState<DocumentTypeView>("book");
  const [sortBy, setSortBy] = useState("year_desc");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("");
  const [selectedShelf, setSelectedShelf] = useState("");

  // Bookshelves
  const [shelves, setShelves] = useState<Bookshelf[]>([]);
  const [shelvesOpen, setShelvesOpen] = useState(true);
  const [newShelfName, setNewShelfName] = useState("");
  const [newShelfDesc, setNewShelfDesc] = useState("");
  const [creatingShelf, setCreatingShelf] = useState(false);
  const [showNewShelfForm, setShowNewShelfForm] = useState(false);
  const [editingShelfId, setEditingShelfId] = useState<string | null>(null);
  const [editingShelfDesc, setEditingShelfDesc] = useState("");
  const [syncing, setSyncing] = useState(false);

  const viewMode: ViewMode = activeType === "book" ? "cover" : "list";
  const pageSize = activeType === "book" ? 12 : 15;

  // Restore list UI state when returning from a document page.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LIBRARY_UI_STATE_KEY);
      if (!raw) {
        setUiStateHydrated(true);
        return;
      }

      const state = JSON.parse(raw) as Partial<LibraryUiState>;
      if (typeof state.searchQuery === "string") {
        setSearchQuery(state.searchQuery);
        setDebouncedQuery(state.searchQuery);
      }
      if (typeof state.selectedDiscipline === "string") setSelectedDiscipline(state.selectedDiscipline);
      if (typeof state.selectedSubdiscipline === "string") setSelectedSubdiscipline(state.selectedSubdiscipline);
      if (isDocumentTypeView(state.activeType)) setActiveType(state.activeType);
      else if (state.selectedType === "paper") setActiveType("paper");
      else if (state.selectedType === "book") setActiveType("book");
      if (typeof state.sortBy === "string") setSortBy(state.sortBy);
      if (isQuickFilter(state.quickFilter)) setQuickFilter(state.quickFilter);
      if (typeof state.selectedShelf === "string") setSelectedShelf(state.selectedShelf);
    } catch (err) {
      console.warn("Failed to restore library UI state", err);
    } finally {
      setUiStateHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!uiStateHydrated) return;

    const state: LibraryUiState = {
      searchQuery,
      selectedDiscipline,
      selectedSubdiscipline,
      activeType,
      sortBy,
      quickFilter,
      selectedShelf,
    };
    window.localStorage.setItem(LIBRARY_UI_STATE_KEY, JSON.stringify(state));
  }, [uiStateHydrated, searchQuery, selectedDiscipline, selectedSubdiscipline, activeType, sortBy, quickFilter, selectedShelf]);

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

  // Load shelves
  const fetchShelves = useCallback(async () => {
    const res = await fetch("/api/shelves");
    const data = await res.json();
    setShelves(data);
  }, []);

  useEffect(() => { fetchShelves(); }, [fetchShelves]);

  // Load documents
  const fetchDocuments = useCallback(async () => {
    if (!uiStateHydrated) return;

    setLoading(true);
    const params = new URLSearchParams();
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (selectedDiscipline) params.set("discipline", selectedDiscipline);
    if (selectedSubdiscipline) params.set("subdiscipline", selectedSubdiscipline);
    params.set("type", activeType);
    params.set("sort", sortBy);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));

    if (quickFilter === "favorite") params.set("favorite", "1");
    else if (quickFilter === "reading") params.set("status", "reading");
    else if (quickFilter === "read") params.set("status", "read");
    else if (quickFilter === "unread") params.set("status", "unread");

    if (selectedShelf) params.set("shelf", selectedShelf);

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
  }, [uiStateHydrated, debouncedQuery, selectedDiscipline, selectedSubdiscipline, activeType, sortBy, page, pageSize, quickFilter, selectedShelf]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const clearFilters = () => {
    setSearchQuery("");
    setDebouncedQuery("");
    setSelectedDiscipline("");
    setSelectedSubdiscipline("");
    setSortBy("year_desc");
    setQuickFilter("");
    setSelectedShelf("");
    setPage(1);
  };

  const hasFilters =
    debouncedQuery || selectedDiscipline || selectedSubdiscipline || quickFilter || selectedShelf;

  // Grid classes per view mode
  const gridClass =
    viewMode === "cover"
      ? "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5"
      : viewMode === "list"
        ? "flex flex-col gap-2"
        : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5";

  // Shelf CRUD
  const createShelf = async () => {
    if (!newShelfName.trim()) return;
    setCreatingShelf(true);
    try {
      const res = await fetch("/api/shelves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newShelfName.trim(), description: newShelfDesc.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to create shelf");
        return;
      }
      setNewShelfName("");
      setNewShelfDesc("");
      setShowNewShelfForm(false);
      await fetchShelves();
    } finally {
      setCreatingShelf(false);
    }
  };

  const deleteShelf = async (shelfId: string, shelfName: string) => {
    if (!confirm(`Delete shelf "${shelfName}"? Related document shelf tags will also be removed.`)) return;
    await fetch(`/api/shelves/${shelfId}`, { method: "DELETE" });
    if (selectedShelf === shelfName) setSelectedShelf("");
    await fetchShelves();
  };

  const saveShelfDesc = async (shelfId: string) => {
    await fetch(`/api/shelves/${shelfId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: editingShelfDesc }),
    });
    setEditingShelfId(null);
    await fetchShelves();
  };

  const handleSync = async () => {
    if (!confirm("Scan source data and update the database index now?")) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        await fetchDocuments();
        await fetchShelves();
      } else {
        alert("Sync failed: " + data.error);
      }
    } catch {
      alert("Sync error");
    } finally {
      setSyncing(false);
    }
  };

  const getDisciplineLabel = (value: string) =>
    filtersData?.disciplines.find((item) => item.value === value)?.label[language] || value;

  const getSubdisciplineLabel = (value: string) =>
    filtersData?.subdisciplines.find((item) => item.value === value)?.label[language] || value;

  const quickFilterItems: { key: QuickFilter; label: string; icon: React.ReactNode }[] = [
    { key: "favorite", label: t("library.favorites"), icon: <Heart className="w-3.5 h-3.5" /> },
    { key: "reading",  label: t("library.reading"), icon: <BookOpen className="w-3.5 h-3.5" /> },
    { key: "read",     label: t("library.read"), icon: <BookCheck className="w-3.5 h-3.5" /> },
    { key: "unread",   label: t("library.unread"), icon: <BookMarked className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-8">
      {/* ===== HERO ===== */}
      <div className="mb-8">
        <div className="flex items-end justify-between mb-1">
          <div>
            <h1 className="text-3xl font-bold gradient-text mb-1">{t("library.title")}</h1>
            <p className="text-muted-foreground text-sm">
              {t("library.subtitle", {
                total,
                disciplines: filtersData?.disciplines.length ?? 0,
                years: filtersData?.yearRange ? `${filtersData.yearRange.min}-${filtersData.yearRange.max}` : "",
              })}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? t("library.syncing") : t("library.sync")}
          </Button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* ===== SIDEBAR ===== */}
        <aside className="hidden lg:block w-[220px] flex-shrink-0">
          <div className="filter-sidebar p-4 sticky top-[72px] space-y-5">
            {/* Search */}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
                {t("library.search")}
              </label>
              <div className="relative">
                <svg
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                  width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                </svg>
                <Input
                  placeholder={t("library.searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-9 text-sm bg-background/50"
                />
              </div>
            </div>

            {/* Quick filters */}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
                {t("library.quickFilters")}
              </label>
              <div className="space-y-1">
                {quickFilterItems.map(({ key, label, icon }) => (
                  <button
                    key={key}
                    onClick={() => { setQuickFilter(quickFilter === key ? "" : key); setPage(1); }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors flex items-center gap-2 ${
                      quickFilter === key
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    {icon}
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Bookshelves */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <button
                  className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1 hover:text-foreground transition-colors"
                  onClick={() => setShelvesOpen(!shelvesOpen)}
                >
                  {shelvesOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  {t("library.bookshelves")}
                </button>
                <button
                  title={t("library.newShelf")}
                  onClick={() => setShowNewShelfForm(!showNewShelfForm)}
                  className="text-muted-foreground hover:text-primary transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* New shelf form */}
              {showNewShelfForm && (
                <div className="mb-2 space-y-1.5 p-2 rounded-lg bg-muted/40 border border-border/50">
                  <Input
                    placeholder={t("library.shelfName")}
                    value={newShelfName}
                    onChange={e => setNewShelfName(e.target.value)}
                    className="h-7 text-xs"
                    onKeyDown={e => e.key === "Enter" && createShelf()}
                  />
                  <Input
                    placeholder={t("library.descriptionOptional")}
                    value={newShelfDesc}
                    onChange={e => setNewShelfDesc(e.target.value)}
                    className="h-7 text-xs"
                  />
                  <div className="flex gap-1">
                    <Button size="sm" className="h-6 text-xs flex-1" onClick={createShelf} disabled={creatingShelf || !newShelfName.trim()}>
                      {t("library.create")}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setShowNewShelfForm(false); setNewShelfName(""); setNewShelfDesc(""); }}>
                      {t("library.cancel")}
                    </Button>
                  </div>
                </div>
              )}

              {shelvesOpen && (
                <div className="space-y-0.5 max-h-[200px] overflow-y-auto pr-1">
                  <button
                    onClick={() => { setSelectedShelf(""); setPage(1); }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors flex items-center gap-2 ${
                      !selectedShelf ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    <Library className="w-3.5 h-3.5" />
                    {t("library.allShelves")}
                  </button>
                  {shelves.map(shelf => (
                    <div key={shelf.shelf_id} className="group relative">
                      {editingShelfId === shelf.shelf_id ? (
                        <div className="p-1.5 rounded-md bg-muted/40 border border-border/50 space-y-1">
                          <div className="text-xs font-medium truncate text-foreground">{shelf.name}</div>
                          <Input
                            value={editingShelfDesc}
                            onChange={e => setEditingShelfDesc(e.target.value)}
                            placeholder={t("library.descriptionOptional")}
                            className="h-6 text-[11px]"
                            autoFocus
                          />
                          <div className="flex gap-1">
                            <button onClick={() => saveShelfDesc(shelf.shelf_id)} className="text-primary hover:text-primary/70"><Check className="w-3 h-3" /></button>
                            <button onClick={() => setEditingShelfId(null)} className="text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setSelectedShelf(shelf.name); setPage(1); }}
                          className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                            selectedShelf === shelf.name ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                          }`}
                          title={shelf.description || shelf.name}
                        >
                          <span className="truncate block">📚 {shelf.name}</span>
                          {shelf.description && <span className="text-[10px] text-muted-foreground/60 truncate block">{shelf.description}</span>}
                        </button>
                      )}
                      {editingShelfId !== shelf.shelf_id && (
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5">
                          <button
                            onClick={() => { setEditingShelfId(shelf.shelf_id); setEditingShelfDesc(shelf.description); }}
                            className="p-0.5 rounded text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="w-2.5 h-2.5" />
                          </button>
                          <button
                            onClick={() => deleteShelf(shelf.shelf_id, shelf.name)}
                            className="p-0.5 rounded text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  {shelves.length === 0 && (
                    <div className="text-[11px] text-muted-foreground/50 text-center py-2">
                      {t("library.noShelves")}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Discipline */}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
                {t("library.discipline")}
              </label>
              <div className="space-y-1 max-h-[180px] overflow-y-auto pr-1">
                <button
                  onClick={() => { setSelectedDiscipline(""); setPage(1); }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors ${!selectedDiscipline
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                >
                  {t("library.allDisciplines")}
                </button>
                {filtersData?.disciplines.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => { setSelectedDiscipline(d.value); setPage(1); }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors ${selectedDiscipline === d.value
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                  >
                    {d.label[language] || d.value}
                  </button>
                ))}
              </div>
            </div>

            {/* Subdiscipline */}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
                {t("library.subdiscipline")}
              </label>
              <div className="space-y-1 max-h-[240px] overflow-y-auto pr-1">
                <button
                  onClick={() => { setSelectedSubdiscipline(""); setPage(1); }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors ${!selectedSubdiscipline
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                >
                  {t("library.allSubdisciplines")}
                </button>
                {filtersData?.subdisciplines.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => { setSelectedSubdiscipline(s.value); setPage(1); }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors ${selectedSubdiscipline === s.value
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                  >
                    {s.label[language] || s.value}
                  </button>
                ))}
              </div>
            </div>

            {/* Sort */}
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
                {t("library.sort")}
              </label>
              <Select value={sortBy} onValueChange={(v) => { setSortBy(v); setPage(1); }}>
                <SelectTrigger className="h-9 text-sm bg-background/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="year_desc">{t("library.newest")}</SelectItem>
                  <SelectItem value="year_asc">{t("library.oldest")}</SelectItem>
                  <SelectItem value="title_asc">{t("library.titleAsc")}</SelectItem>
                  <SelectItem value="title_desc">{t("library.titleDesc")}</SelectItem>
                  <SelectItem value="token_desc">{t("library.longest")}</SelectItem>
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
                {t("library.clearFilters")}
              </Button>
            )}
          </div>
        </aside>

        {/* ===== MAIN CONTENT ===== */}
        <div className="flex-1 min-w-0">
          {/* Toolbar: document type views + mobile search */}
          <div className="flex flex-col gap-4 mb-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center bg-muted/50 rounded-xl p-1 flex-shrink-0">
                <button
                  onClick={() => { setActiveType("book"); setPage(1); }}
                  className={`view-btn ${activeType === "book" ? "active" : ""}`}
                  title={t("library.book")}
                >
                  <BookOpen className="w-4 h-4" />
                  <span className="text-xs">{t("library.book")}</span>
                </button>
                <button
                  onClick={() => { setActiveType("paper"); setPage(1); }}
                  className={`view-btn ${activeType === "paper" ? "active" : ""}`}
                  title={t("library.paper")}
                >
                  <FileText className="w-4 h-4" />
                  <span className="text-xs">{t("library.paper")}</span>
                </button>
              </div>
              <div className="text-xs text-muted-foreground">
                {activeType === "book" ? t("library.cover") : t("library.list")}
                <span className="mx-1">/</span>
                {t("library.results", { total })}
              </div>
            </div>

            <div className="flex items-center justify-between">
            {/* Mobile search (lg: hidden) */}
            <div className="lg:hidden flex-1 mr-3">
              <Input
                placeholder={t("library.search")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            {/* Active filters */}
            {hasFilters && (
              <div className="hidden lg:flex items-center gap-2 flex-1 flex-wrap">
                {debouncedQuery && (
                  <span className="tag-chip tag-chip-discipline flex items-center gap-1">
                    {t("library.search")}: {debouncedQuery}
                    <button onClick={() => setSearchQuery("")} className="hover:text-destructive">✕</button>
                  </span>
                )}
                {selectedDiscipline && (
                  <span className="tag-chip tag-chip-discipline flex items-center gap-1">
                    {getDisciplineLabel(selectedDiscipline)}
                    <button onClick={() => setSelectedDiscipline("")} className="hover:text-destructive">✕</button>
                  </span>
                )}
                {selectedSubdiscipline && (
                  <span className="tag-chip tag-chip-subdiscipline flex items-center gap-1">
                    {getSubdisciplineLabel(selectedSubdiscipline)}
                    <button onClick={() => setSelectedSubdiscipline("")} className="hover:text-destructive">✕</button>
                  </span>
                )}
                {quickFilter && (
                  <span className="tag-chip tag-chip-subdiscipline flex items-center gap-1">
                    {quickFilterItems.find(q => q.key === quickFilter)?.label}
                    <button onClick={() => setQuickFilter("")} className="hover:text-destructive">✕</button>
                  </span>
                )}
                {selectedShelf && (
                  <span className="tag-chip flex items-center gap-1" style={{ background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--border)" }}>
                    📚 {selectedShelf}
                    <button onClick={() => setSelectedShelf("")} className="hover:text-destructive">✕</button>
                  </span>
                )}
                <span className="text-xs text-muted-foreground ml-1">{t("library.results", { total })}</span>
              </div>
            )}
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
              <h3 className="text-lg font-semibold mb-1">{t("library.noDocuments")}</h3>
              <p className="text-sm text-muted-foreground mb-4">{t("library.noDocumentsHint")}</p>
              <Button variant="outline" size="sm" onClick={clearFilters}>
                {t("library.clearFilters")}
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
