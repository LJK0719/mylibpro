import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_DIR = path.join(process.cwd(), "db");
const DB_PATH = path.join(DB_DIR, "library.db");

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
      folder_name   TEXT DEFAULT ''
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
}

export function recordToView(rec: DocumentRecord): DocumentView {
  return {
    ...rec,
    authors: JSON.parse(rec.authors || "[]"),
    discipline: JSON.parse(rec.discipline || "[]"),
    subdiscipline: JSON.parse(rec.subdiscipline || "[]"),
    keywords: JSON.parse(rec.keywords || "[]"),
  };
}
