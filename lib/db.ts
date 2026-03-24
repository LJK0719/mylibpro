import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// 优先读取 DB_PATH 环境变量；未配置时默认使用项目内的 db/library.db
const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.cwd(), process.env.DB_PATH)
  : path.join(process.cwd(), "db", "library.db");
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
      authors       TEXT NOT NULL DEFAULT '[]',
      year          INTEGER,
      discipline    TEXT NOT NULL DEFAULT '[]',
      subdiscipline TEXT NOT NULL DEFAULT '[]',
      keywords      TEXT NOT NULL DEFAULT '[]',
      abstract      TEXT DEFAULT '',
      toc           TEXT DEFAULT '',
      full_text_path TEXT DEFAULT '',
      token_count   INTEGER DEFAULT 0,
      indexed_date  TEXT DEFAULT '',
      citation_info TEXT DEFAULT '',
      remark        TEXT DEFAULT '',
      folder_name   TEXT DEFAULT '',
      status        TEXT NOT NULL DEFAULT 'unread',
      is_favorite   INTEGER NOT NULL DEFAULT 0,
      chapters      TEXT NOT NULL DEFAULT '[]',
      shelves       TEXT NOT NULL DEFAULT '[]'
    );
  `);

  // Migration: add missing columns for older databases
  const cols = (_db!.pragma(`table_info(documents)`) as { name: string }[]).map(c => c.name);
  const migrations: [string, string][] = [
    ['status',      `ALTER TABLE documents ADD COLUMN status TEXT NOT NULL DEFAULT 'unread';`],
    ['is_favorite', `ALTER TABLE documents ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0;`],
    ['chapters',    `ALTER TABLE documents ADD COLUMN chapters TEXT NOT NULL DEFAULT '[]';`],
    ['shelves',     `ALTER TABLE documents ADD COLUMN shelves TEXT NOT NULL DEFAULT '[]';`],
  ];
  for (const [col, sql] of migrations) {
    if (!cols.includes(col)) {
      _db!.exec(sql);
    }
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
      content='documents',
      content_rowid='rowid',
      tokenize='unicode61'
    );
  `);

  // Triggers to keep FTS in sync
  _db.exec(`
    CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
      INSERT INTO documents_fts(rowid, document_id, title, authors, keywords, abstract, discipline, subdiscipline)
      VALUES (new.rowid, new.document_id, new.title, new.authors, new.keywords, new.abstract, new.discipline, new.subdiscipline);
    END;
  `);

  _db.exec(`
    CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
      INSERT INTO documents_fts(documents_fts, rowid, document_id, title, authors, keywords, abstract, discipline, subdiscipline)
      VALUES ('delete', old.rowid, old.document_id, old.title, old.authors, old.keywords, old.abstract, old.discipline, old.subdiscipline);
    END;
  `);

  _db.exec(`
    CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
      INSERT INTO documents_fts(documents_fts, rowid, document_id, title, authors, keywords, abstract, discipline, subdiscipline)
      VALUES ('delete', old.rowid, old.document_id, old.title, old.authors, old.keywords, old.abstract, old.discipline, old.subdiscipline);
      INSERT INTO documents_fts(rowid, document_id, title, authors, keywords, abstract, discipline, subdiscipline)
      VALUES (new.rowid, new.document_id, new.title, new.authors, new.keywords, new.abstract, new.discipline, new.subdiscipline);
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
  authors: string; // JSON array string
  year: number;
  discipline: string; // JSON array string
  subdiscipline: string; // JSON array string
  keywords: string; // JSON array string
  abstract: string;
  toc: string;
  full_text_path: string;
  token_count: number;
  indexed_date: string;
  citation_info: string;
  remark: string;
  folder_name: string;
  status: 'unread' | 'reading' | 'read';
  is_favorite: number;
  chapters: string; // JSON array string of chapter file names
  shelves: string;  // JSON array string of shelf names this doc belongs to
}

export interface DocumentView {
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
  chapters: string[]; // sorted list of chapter file names
  shelves: string[];  // list of bookshelf names this doc belongs to
}

export function recordToView(rec: DocumentRecord): DocumentView {
  return {
    ...rec,
    authors: JSON.parse(rec.authors || "[]"),
    discipline: JSON.parse(rec.discipline || "[]"),
    subdiscipline: JSON.parse(rec.subdiscipline || "[]"),
    keywords: JSON.parse(rec.keywords || "[]"),
    is_favorite: rec.is_favorite === 1,
    chapters: JSON.parse(rec.chapters || "[]"),
    shelves: JSON.parse(rec.shelves || "[]"),
  };
}

export interface BookshelfRecord {
  shelf_id: string;
  name: string;
  description: string;
  created_at: string;
}
