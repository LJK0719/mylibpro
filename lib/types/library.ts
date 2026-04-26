import type { DocumentMetadataI18n } from "@/lib/i18n";

/**
 * Shared library / catalog types.
 *
 * Canonical view types reused by both server (API routes, agent tools)
 * and client (pages, components). Frontend code may consume a subset of
 * these fields — TypeScript's structural typing keeps that safe.
 */

export type DocumentStatus = 'unread' | 'reading' | 'read';

export interface DocumentView {
  document_id: string;
  type: string;
  title: string;
  title_zh: string;
  title_en: string;
  authors: string[];
  authors_zh: string[];
  authors_en: string[];
  year: number;
  discipline: string[];
  discipline_zh: string[];
  discipline_en: string[];
  subdiscipline: string[];
  subdiscipline_zh: string[];
  subdiscipline_en: string[];
  keywords: string[];
  keywords_zh: string[];
  keywords_en: string[];
  abstract: string;
  abstract_zh: string;
  abstract_en: string;
  toc: string;
  toc_zh: string;
  toc_en: string;
  metadata_i18n: DocumentMetadataI18n;
  full_text_path: string;
  token_count: number;
  indexed_date: string;
  citation_info: string;
  remark: string;
  folder_name: string;
  status: DocumentStatus;
  is_favorite: boolean;
  /** CJK-expanded search text for FTS; not displayed in UI. */
  search_text: string;
  /** Sorted list of chapter file names. */
  chapters: string[];
  /** Names of bookshelves this document belongs to. */
  shelves: string[];
}

export interface Bookshelf {
  shelf_id: string;
  name: string;
  description: string;
  /** Optional — server returns it; some client views ignore it. */
  created_at?: string;
}
