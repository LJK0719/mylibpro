import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { DocumentStatus, DocumentView } from "./types/library";
import { getDbPath } from "./config";
import { buildSearchText } from "./search/cjk";
import { expandDisciplineForSearch } from "./search/disciplines";
import { normalizeMetadataI18n } from "./i18n";

export type { DocumentStatus, DocumentView } from "./types/library";

const DB_PATH = getDbPath();
const DB_DIR = path.dirname(DB_PATH);

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  // Ensure db directory exists
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  // Create main documents table (supports both book and paper types)
  _db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      document_id   TEXT PRIMARY KEY,
      type          TEXT NOT NULL DEFAULT 'book',
      title         TEXT NOT NULL,
      title_zh      TEXT NOT NULL DEFAULT '',
      title_en      TEXT NOT NULL DEFAULT '',
      authors       TEXT NOT NULL DEFAULT '[]',
      authors_zh    TEXT NOT NULL DEFAULT '[]',
      authors_en    TEXT NOT NULL DEFAULT '[]',
      year          INTEGER,
      discipline    TEXT NOT NULL DEFAULT '[]',
      discipline_zh TEXT NOT NULL DEFAULT '[]',
      discipline_en TEXT NOT NULL DEFAULT '[]',
      subdiscipline TEXT NOT NULL DEFAULT '[]',
      subdiscipline_zh TEXT NOT NULL DEFAULT '[]',
      subdiscipline_en TEXT NOT NULL DEFAULT '[]',
      keywords      TEXT NOT NULL DEFAULT '[]',
      keywords_zh   TEXT NOT NULL DEFAULT '[]',
      keywords_en   TEXT NOT NULL DEFAULT '[]',
      abstract      TEXT DEFAULT '',
      abstract_zh   TEXT NOT NULL DEFAULT '',
      abstract_en   TEXT NOT NULL DEFAULT '',
      toc           TEXT DEFAULT '',
      toc_zh        TEXT NOT NULL DEFAULT '',
      toc_en        TEXT NOT NULL DEFAULT '',
      full_text_path TEXT DEFAULT '',
      token_count   INTEGER DEFAULT 0,
      indexed_date  TEXT DEFAULT '',
      citation_info TEXT DEFAULT '',
      remark        TEXT DEFAULT '',
      folder_name   TEXT DEFAULT '',
      status        TEXT NOT NULL DEFAULT 'unread',
      is_favorite   INTEGER NOT NULL DEFAULT 0,
      chapters      TEXT NOT NULL DEFAULT '[]',
      shelves       TEXT NOT NULL DEFAULT '[]',
      search_text   TEXT NOT NULL DEFAULT '',
      bibliographic TEXT NOT NULL DEFAULT '{}',
      book          TEXT NOT NULL DEFAULT '{}'
    );
  `);

  // Migration: add missing columns for older databases
  const cols = (_db!.pragma(`table_info(documents)`) as { name: string }[]).map(c => c.name);
  const migrations: [string, string][] = [
    ['status',      `ALTER TABLE documents ADD COLUMN status TEXT NOT NULL DEFAULT 'unread';`],
    ['is_favorite', `ALTER TABLE documents ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0;`],
    ['chapters',    `ALTER TABLE documents ADD COLUMN chapters TEXT NOT NULL DEFAULT '[]';`],
    ['shelves',     `ALTER TABLE documents ADD COLUMN shelves TEXT NOT NULL DEFAULT '[]';`],
    ['search_text', `ALTER TABLE documents ADD COLUMN search_text TEXT NOT NULL DEFAULT '';`],
    ['title_zh', `ALTER TABLE documents ADD COLUMN title_zh TEXT NOT NULL DEFAULT '';`],
    ['title_en', `ALTER TABLE documents ADD COLUMN title_en TEXT NOT NULL DEFAULT '';`],
    ['authors_zh', `ALTER TABLE documents ADD COLUMN authors_zh TEXT NOT NULL DEFAULT '[]';`],
    ['authors_en', `ALTER TABLE documents ADD COLUMN authors_en TEXT NOT NULL DEFAULT '[]';`],
    ['discipline_zh', `ALTER TABLE documents ADD COLUMN discipline_zh TEXT NOT NULL DEFAULT '[]';`],
    ['discipline_en', `ALTER TABLE documents ADD COLUMN discipline_en TEXT NOT NULL DEFAULT '[]';`],
    ['subdiscipline_zh', `ALTER TABLE documents ADD COLUMN subdiscipline_zh TEXT NOT NULL DEFAULT '[]';`],
    ['subdiscipline_en', `ALTER TABLE documents ADD COLUMN subdiscipline_en TEXT NOT NULL DEFAULT '[]';`],
    ['keywords_zh', `ALTER TABLE documents ADD COLUMN keywords_zh TEXT NOT NULL DEFAULT '[]';`],
    ['keywords_en', `ALTER TABLE documents ADD COLUMN keywords_en TEXT NOT NULL DEFAULT '[]';`],
    ['abstract_zh', `ALTER TABLE documents ADD COLUMN abstract_zh TEXT NOT NULL DEFAULT '';`],
    ['abstract_en', `ALTER TABLE documents ADD COLUMN abstract_en TEXT NOT NULL DEFAULT '';`],
    ['toc_zh', `ALTER TABLE documents ADD COLUMN toc_zh TEXT NOT NULL DEFAULT '';`],
    ['toc_en', `ALTER TABLE documents ADD COLUMN toc_en TEXT NOT NULL DEFAULT '';`],
    ['bibliographic', `ALTER TABLE documents ADD COLUMN bibliographic TEXT NOT NULL DEFAULT '{}';`],
    ['book', `ALTER TABLE documents ADD COLUMN book TEXT NOT NULL DEFAULT '{}';`],
  ];
  for (const [col, sql] of migrations) {
    if (!cols.includes(col)) {
      _db!.exec(sql);
    }
  }

  _db.exec(`
    UPDATE documents
    SET search_text = title || ' ' || authors || ' ' || keywords || ' ' || abstract || ' ' || discipline || ' ' || subdiscipline
    WHERE search_text = '';
  `);

  const rowsMissingCjkSearch = _db.prepare(
    `SELECT * FROM documents WHERE search_text = title || ' ' || authors || ' ' || keywords || ' ' || abstract || ' ' || discipline || ' ' || subdiscipline`
  ).all() as DocumentRecord[];
  const updateSearchText = _db.prepare(`UPDATE documents SET search_text = ? WHERE document_id = ?`);
  for (const row of rowsMissingCjkSearch) {
    updateSearchText.run(
      buildSearchText(row.title, row.authors, row.keywords, row.abstract, expandDisciplineForSearch(row.discipline), expandDisciplineForSearch(row.subdiscipline)),
      row.document_id
    );
  }

  const ftsCols = (_db.pragma(`table_info(documents_fts)`) as { name: string }[]).map(c => c.name);
  if (ftsCols.length > 0 && !ftsCols.includes("search_text")) {
    _db.exec(`
      DROP TRIGGER IF EXISTS documents_ai;
      DROP TRIGGER IF EXISTS documents_ad;
      DROP TRIGGER IF EXISTS documents_au;
      DROP TABLE IF EXISTS documents_fts;
    `);
  }

  // Create bookshelves table for managing desktop bookshelves
  _db.exec(`
    CREATE TABLE IF NOT EXISTS bookshelves (
      shelf_id    TEXT PRIMARY KEY,
      name        TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Hierarchical document tree (vectorless / PageIndex-style navigation index)
  // used by the external library-api layer. Each row is a node in a document's
  // chapter→section→subsection tree; char offsets locate the node's text inside
  // `chapter_file` so the full text can be sliced on demand. `summary` is an
  // optional, lazily-filled node summary. Rebuilt per document by
  // scripts/build-index.ts; safe to drop and regenerate.
  _db.exec(`
    CREATE TABLE IF NOT EXISTS doc_nodes (
      node_id      TEXT PRIMARY KEY,
      document_id  TEXT NOT NULL,
      parent_id    TEXT,
      level        INTEGER NOT NULL DEFAULT 0,
      ordinal      INTEGER NOT NULL DEFAULT 0,
      title        TEXT NOT NULL DEFAULT '',
      chapter_file TEXT NOT NULL DEFAULT '',
      char_start   INTEGER NOT NULL DEFAULT 0,
      char_end     INTEGER NOT NULL DEFAULT 0,
      token_count  INTEGER NOT NULL DEFAULT 0,
      summary      TEXT NOT NULL DEFAULT '',
      heading_path TEXT NOT NULL DEFAULT ''
    );
  `);
  _db.exec(`CREATE INDEX IF NOT EXISTS idx_doc_nodes_doc ON doc_nodes(document_id, parent_id, ordinal);`);


  // Create FTS5 virtual table for full-text search
  _db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
      document_id UNINDEXED,
      title,
      authors,
      keywords,
      abstract,
      discipline,
      subdiscipline,
      search_text,
      content='documents',
      content_rowid='rowid',
      tokenize='unicode61'
    );
  `);

  // Triggers to keep FTS in sync
  _db.exec(`
    CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
      INSERT INTO documents_fts(rowid, document_id, title, authors, keywords, abstract, discipline, subdiscipline, search_text)
      VALUES (new.rowid, new.document_id, new.title, new.authors, new.keywords, new.abstract, new.discipline, new.subdiscipline, new.search_text);
    END;
  `);

  _db.exec(`
    CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
      INSERT INTO documents_fts(documents_fts, rowid, document_id, title, authors, keywords, abstract, discipline, subdiscipline, search_text)
      VALUES ('delete', old.rowid, old.document_id, old.title, old.authors, old.keywords, old.abstract, old.discipline, old.subdiscipline, old.search_text);
    END;
  `);

  _db.exec(`
    CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
      INSERT INTO documents_fts(documents_fts, rowid, document_id, title, authors, keywords, abstract, discipline, subdiscipline, search_text)
      VALUES ('delete', old.rowid, old.document_id, old.title, old.authors, old.keywords, old.abstract, old.discipline, old.subdiscipline, old.search_text);
      INSERT INTO documents_fts(rowid, document_id, title, authors, keywords, abstract, discipline, subdiscipline, search_text)
      VALUES (new.rowid, new.document_id, new.title, new.authors, new.keywords, new.abstract, new.discipline, new.subdiscipline, new.search_text);
    END;
  `);

  // Index for common queries
  _db.exec(`CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type);`);
  _db.exec(`CREATE INDEX IF NOT EXISTS idx_documents_year ON documents(year);`);
  _db.exec(`CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);`);
  _db.exec(`CREATE INDEX IF NOT EXISTS idx_documents_is_favorite ON documents(is_favorite);`);

  return _db;
}

export interface DocumentRecord {
  document_id: string;
  type: string;
  title: string;
  title_zh: string;
  title_en: string;
  authors: string; // JSON array string
  authors_zh: string;
  authors_en: string;
  year: number;
  discipline: string; // JSON array string
  discipline_zh: string;
  discipline_en: string;
  subdiscipline: string; // JSON array string
  subdiscipline_zh: string;
  subdiscipline_en: string;
  keywords: string; // JSON array string
  keywords_zh: string;
  keywords_en: string;
  abstract: string;
  abstract_zh: string;
  abstract_en: string;
  toc: string;
  toc_zh: string;
  toc_en: string;
  full_text_path: string;
  token_count: number;
  indexed_date: string;
  citation_info: string;
  remark: string;
  folder_name: string;
  status: DocumentStatus;
  is_favorite: number;
  chapters: string; // JSON array string of chapter file names
  search_text: string;
  shelves: string;  // JSON array string of shelf names this doc belongs to
  bibliographic: string; // JSON object string (paper-specific)
  book: string;          // JSON object string (book-specific)
}

export function recordToView(rec: DocumentRecord): DocumentView {
  const metadata_i18n = normalizeMetadataI18n({
    title: rec.title,
    title_zh: rec.title_zh,
    title_en: rec.title_en,
    authors: rec.authors,
    authors_zh: rec.authors_zh,
    authors_en: rec.authors_en,
    discipline: rec.discipline,
    discipline_zh: rec.discipline_zh,
    discipline_en: rec.discipline_en,
    subdiscipline: rec.subdiscipline,
    subdiscipline_zh: rec.subdiscipline_zh,
    subdiscipline_en: rec.subdiscipline_en,
    keywords: rec.keywords,
    keywords_zh: rec.keywords_zh,
    keywords_en: rec.keywords_en,
    abstract: rec.abstract,
    abstract_zh: rec.abstract_zh,
    abstract_en: rec.abstract_en,
    toc: rec.toc,
    toc_zh: rec.toc_zh,
    toc_en: rec.toc_en,
  });
  return {
    ...rec,
    authors: JSON.parse(rec.authors || "[]"),
    authors_zh: JSON.parse(rec.authors_zh || "[]"),
    authors_en: JSON.parse(rec.authors_en || "[]"),
    discipline: JSON.parse(rec.discipline || "[]"),
    discipline_zh: JSON.parse(rec.discipline_zh || "[]"),
    discipline_en: JSON.parse(rec.discipline_en || "[]"),
    subdiscipline: JSON.parse(rec.subdiscipline || "[]"),
    subdiscipline_zh: JSON.parse(rec.subdiscipline_zh || "[]"),
    subdiscipline_en: JSON.parse(rec.subdiscipline_en || "[]"),
    keywords: JSON.parse(rec.keywords || "[]"),
    keywords_zh: JSON.parse(rec.keywords_zh || "[]"),
    keywords_en: JSON.parse(rec.keywords_en || "[]"),
    title_zh: metadata_i18n.title.zh,
    title_en: metadata_i18n.title.en,
    abstract_zh: metadata_i18n.abstract.zh,
    abstract_en: metadata_i18n.abstract.en,
    toc_zh: metadata_i18n.toc.zh,
    toc_en: metadata_i18n.toc.en,
    metadata_i18n,
    is_favorite: rec.is_favorite === 1,
    chapters: JSON.parse(rec.chapters || "[]"),
    shelves: JSON.parse(rec.shelves || "[]"),
    bibliographic: safeParseObject(rec.bibliographic),
    book: safeParseObject(rec.book),
  };
}

function safeParseObject(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export interface BookshelfRecord {
  shelf_id: string;
  name: string;
  description: string;
  created_at: string;
}
