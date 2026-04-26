"use client";

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import type { Language } from "@/lib/i18n";

const STORAGE_KEY = "mylibpro.language";

type TranslationKey =
  | "nav.agent"
  | "language.en"
  | "language.zh"
  | "language.toggle"
  | "library.title"
  | "library.subtitle"
  | "library.search"
  | "library.searchPlaceholder"
  | "library.quickFilters"
  | "library.favorites"
  | "library.reading"
  | "library.read"
  | "library.unread"
  | "library.bookshelves"
  | "library.newShelf"
  | "library.shelfName"
  | "library.descriptionOptional"
  | "library.create"
  | "library.cancel"
  | "library.allShelves"
  | "library.noShelves"
  | "library.type"
  | "library.allTypes"
  | "library.book"
  | "library.paper"
  | "library.discipline"
  | "library.allDisciplines"
  | "library.subdiscipline"
  | "library.allSubdisciplines"
  | "library.sort"
  | "library.newest"
  | "library.oldest"
  | "library.titleAsc"
  | "library.titleDesc"
  | "library.longest"
  | "library.clearFilters"
  | "library.results"
  | "library.grid"
  | "library.list"
  | "library.cover"
  | "library.noDocuments"
  | "library.noDocumentsHint"
  | "library.sync"
  | "library.syncing"
  | "detail.library"
  | "detail.notSet"
  | "detail.edit"
  | "detail.save"
  | "detail.saving"
  | "detail.done"
  | "detail.manage"
  | "detail.favorite"
  | "detail.unfavorite"
  | "detail.year"
  | "detail.length"
  | "detail.indexedDate"
  | "detail.keywords"
  | "detail.abstract"
  | "detail.toc"
  | "detail.remark"
  | "detail.noAbstract"
  | "detail.noToc"
  | "detail.noRemark"
  | "detail.addRemark"
  | "detail.back"
  | "agent.title"
  | "agent.subtitle"
  | "agent.workspace"
  | "agent.newChat"
  | "agent.thinking"
  | "agent.emptyHint"
  | "agent.inputPlaceholder"
  | "agent.inputHelp"
  | "agent.copy"
  | "agent.regenerate";

const TRANSLATIONS: Record<Language, Record<TranslationKey, string>> = {
  en: {
    "nav.agent": "Research Agent",
    "language.en": "EN",
    "language.zh": "中文",
    "language.toggle": "Switch language",
    "library.title": "My Library",
    "library.subtitle": "{total} documents · {disciplines} disciplines · {years}",
    "library.search": "Search",
    "library.searchPlaceholder": "Title, author, keyword",
    "library.quickFilters": "Quick filters",
    "library.favorites": "Favorites",
    "library.reading": "Reading",
    "library.read": "Read",
    "library.unread": "Unread",
    "library.bookshelves": "Bookshelves",
    "library.newShelf": "New shelf",
    "library.shelfName": "Shelf name",
    "library.descriptionOptional": "Description (optional)",
    "library.create": "Create",
    "library.cancel": "Cancel",
    "library.allShelves": "All shelves",
    "library.noShelves": "No shelves yet. Use + to create one.",
    "library.type": "Type",
    "library.allTypes": "All types",
    "library.book": "Book",
    "library.paper": "Paper",
    "library.discipline": "Discipline",
    "library.allDisciplines": "All disciplines",
    "library.subdiscipline": "Subdiscipline",
    "library.allSubdisciplines": "All subdisciplines",
    "library.sort": "Sort",
    "library.newest": "Newest first",
    "library.oldest": "Oldest first",
    "library.titleAsc": "Title A-Z",
    "library.titleDesc": "Title Z-A",
    "library.longest": "Longest first",
    "library.clearFilters": "Clear filters",
    "library.results": "{total} results",
    "library.grid": "Grid",
    "library.list": "List",
    "library.cover": "Cover",
    "library.noDocuments": "No documents found",
    "library.noDocumentsHint": "Try changing the search terms or clearing filters.",
    "library.sync": "Sync library",
    "library.syncing": "Syncing...",
    "detail.library": "Library",
    "detail.notSet": "Not set",
    "detail.edit": "Edit",
    "detail.save": "Save",
    "detail.saving": "Saving...",
    "detail.done": "Done",
    "detail.manage": "Manage",
    "detail.favorite": "Favorite",
    "detail.unfavorite": "Remove favorite",
    "detail.year": "Year",
    "detail.length": "Length",
    "detail.indexedDate": "Indexed",
    "detail.keywords": "Keywords",
    "detail.abstract": "Abstract",
    "detail.toc": "Table of contents",
    "detail.remark": "Remark",
    "detail.noAbstract": "No abstract available",
    "detail.noToc": "No table of contents available",
    "detail.noRemark": "No remark yet. Click to add one.",
    "detail.addRemark": "Add remark",
    "detail.back": "Back to library",
    "agent.title": "Academic Research Agent",
    "agent.subtitle": "Full-text-first analysis from your library",
    "agent.workspace": "Workspace",
    "agent.newChat": "New chat",
    "agent.thinking": "Thinking...",
    "agent.emptyHint": "I can search your library, read full evidence units, and answer with citations.",
    "agent.inputPlaceholder": "Ask an academic question...",
    "agent.inputHelp": "Enter to send · Shift + Enter for a new line · Answers are grounded in library evidence",
    "agent.copy": "Copy",
    "agent.regenerate": "Regenerate",
  },
  zh: {
    "nav.agent": "研究助手",
    "language.en": "EN",
    "language.zh": "中文",
    "language.toggle": "切换语言",
    "library.title": "我的文献库",
    "library.subtitle": "{total} 篇文献 · {disciplines} 个学科 · {years}",
    "library.search": "搜索",
    "library.searchPlaceholder": "书名、作者、关键词",
    "library.quickFilters": "快速筛选",
    "library.favorites": "我的收藏",
    "library.reading": "在读",
    "library.read": "已读",
    "library.unread": "未读",
    "library.bookshelves": "桌面书架",
    "library.newShelf": "新建书架",
    "library.shelfName": "书架名称",
    "library.descriptionOptional": "说明（可选）",
    "library.create": "创建",
    "library.cancel": "取消",
    "library.allShelves": "全部书架",
    "library.noShelves": "还没有书架，点击 + 新建",
    "library.type": "类型",
    "library.allTypes": "全部类型",
    "library.book": "图书",
    "library.paper": "论文",
    "library.discipline": "学科",
    "library.allDisciplines": "全部学科",
    "library.subdiscipline": "子领域",
    "library.allSubdisciplines": "全部子领域",
    "library.sort": "排序",
    "library.newest": "最新优先",
    "library.oldest": "最早优先",
    "library.titleAsc": "书名 A-Z",
    "library.titleDesc": "书名 Z-A",
    "library.longest": "篇幅最大",
    "library.clearFilters": "清除筛选",
    "library.results": "{total} 条结果",
    "library.grid": "网格",
    "library.list": "列表",
    "library.cover": "封面",
    "library.noDocuments": "未找到文献",
    "library.noDocumentsHint": "尝试调整搜索条件或清除筛选。",
    "library.sync": "同步文献库",
    "library.syncing": "同步中...",
    "detail.library": "文献库",
    "detail.notSet": "未设置",
    "detail.edit": "编辑",
    "detail.save": "保存",
    "detail.saving": "保存中...",
    "detail.done": "完成",
    "detail.manage": "管理",
    "detail.favorite": "收藏",
    "detail.unfavorite": "取消收藏",
    "detail.year": "年份",
    "detail.length": "篇幅",
    "detail.indexedDate": "索引日期",
    "detail.keywords": "关键词",
    "detail.abstract": "摘要",
    "detail.toc": "目录",
    "detail.remark": "备注",
    "detail.noAbstract": "暂无摘要",
    "detail.noToc": "暂无目录",
    "detail.noRemark": "暂无备注，点击添加。",
    "detail.addRemark": "添加备注",
    "detail.back": "返回文献库",
    "agent.title": "学术研究助手",
    "agent.subtitle": "基于全文证据的深度分析",
    "agent.workspace": "工作区",
    "agent.newChat": "新对话",
    "agent.thinking": "思考中...",
    "agent.emptyHint": "我可以检索你的数字图书馆，阅读完整证据单元，并给出带引用的回答。",
    "agent.inputPlaceholder": "输入你的学术问题...",
    "agent.inputHelp": "按 Enter 发送 · Shift + Enter 换行 · 回答基于图书馆文献证据",
    "agent.copy": "复制",
    "agent.regenerate": "重新回答",
  },
};

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function getStoredLanguage(): Language {
  if (typeof window === "undefined") return "en";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === "zh" ? "zh" : "en";
}

function subscribeToLanguageChange(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener("mylibpro-language-change", onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("mylibpro-language-change", onStoreChange);
  };
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const language = useSyncExternalStore<Language>(subscribeToLanguageChange, getStoredLanguage, () => "en");

  const setLanguage = (next: Language) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next);
      document.documentElement.lang = next === "zh" ? "zh-CN" : "en";
      window.dispatchEvent(new Event("mylibpro-language-change"));
    }
  };

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    setLanguage,
    toggleLanguage: () => setLanguage(language === "en" ? "zh" : "en"),
    t: (key, params) => {
      let text = TRANSLATIONS[language][key] || TRANSLATIONS.en[key] || key;
      for (const [name, value] of Object.entries(params || {})) {
        text = text.replaceAll(`{${name}}`, String(value));
      }
      return text;
    },
  }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used inside LanguageProvider");
  return context;
}
