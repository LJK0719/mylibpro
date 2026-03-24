/**
 * Import script: reads metadata.json files from data/book (and future data/paper)
 * and upserts them into the SQLite database.
 *
 * Usage: npm run import
 */

import path from "path";
import fs from "fs";
import Database from "better-sqlite3";
import { loadEnvConfig } from "@next/env";

// Resolve paths relative to project root
const PROJECT_ROOT = path.resolve(__dirname, "..");

// Load .env.local
loadEnvConfig(PROJECT_ROOT);

const DATA_ROOT = process.env.DATA_ROOT || path.resolve(PROJECT_ROOT, "..", "data");
const DB_DIR = path.join(PROJECT_ROOT, "db");
const DB_PATH = process.env.DB_PATH ? path.resolve(PROJECT_ROOT, process.env.DB_PATH) : path.join(DB_DIR, "library.db");

// Document source directories to scan
const SOURCE_DIRS: { dir: string; type: string }[] = [
    { dir: path.join(DATA_ROOT, "book"), type: "book" },
    { dir: path.join(DATA_ROOT, "paper"), type: "paper" },
];

function main() {
    // Ensure db directory exists
    if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
    }

    const db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    // Create table
    db.exec(`
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
      chapters      TEXT NOT NULL DEFAULT '[]'
    );
  `);

    // Migration: add missing columns if not exists (for older databases)
    const cols = (db.pragma(`table_info(documents)`) as { name: string }[]).map(c => c.name);
    const migrations: [string, string][] = [
        ['status',      `ALTER TABLE documents ADD COLUMN status TEXT NOT NULL DEFAULT 'unread';`],
        ['is_favorite', `ALTER TABLE documents ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0;`],
        ['chapters',    `ALTER TABLE documents ADD COLUMN chapters TEXT NOT NULL DEFAULT '[]';`],
    ];
    for (const [col, sql] of migrations) {
        if (!cols.includes(col)) {
            db.exec(sql);
            console.log(`   ✔ Migrated: added column '${col}'.`);
        }
    }

    // Create FTS5
    db.exec(`
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

    // Triggers
    db.exec(`
    CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
      INSERT INTO documents_fts(rowid, document_id, title, authors, keywords, abstract, discipline, subdiscipline)
      VALUES (new.rowid, new.document_id, new.title, new.authors, new.keywords, new.abstract, new.discipline, new.subdiscipline);
    END;
  `);
    db.exec(`
    CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
      INSERT INTO documents_fts(documents_fts, rowid, document_id, title, authors, keywords, abstract, discipline, subdiscipline)
      VALUES ('delete', old.rowid, old.document_id, old.title, old.authors, old.keywords, old.abstract, old.discipline, old.subdiscipline);
    END;
  `);
    db.exec(`
    CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
      INSERT INTO documents_fts(documents_fts, rowid, document_id, title, authors, keywords, abstract, discipline, subdiscipline)
      VALUES ('delete', old.rowid, old.document_id, old.title, old.authors, old.keywords, old.abstract, old.discipline, old.subdiscipline);
      INSERT INTO documents_fts(rowid, document_id, title, authors, keywords, abstract, discipline, subdiscipline)
      VALUES (new.rowid, new.document_id, new.title, new.authors, new.keywords, new.abstract, new.discipline, new.subdiscipline);
    END;
  `);

    db.exec(`CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_documents_year ON documents(year);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_documents_is_favorite ON documents(is_favorite);`);

    // Prepare upsert statement
    const upsert = db.prepare(`
    INSERT INTO documents (
      document_id, type, title, authors, year, discipline, subdiscipline,
      keywords, abstract, toc, full_text_path, token_count, indexed_date,
      citation_info, remark, folder_name, status, is_favorite, chapters
    ) VALUES (
      @document_id, @type, @title, @authors, @year, @discipline, @subdiscipline,
      @keywords, @abstract, @toc, @full_text_path, @token_count, @indexed_date,
      @citation_info, @remark, @folder_name, @status, @is_favorite, @chapters
    ) ON CONFLICT(document_id) DO UPDATE SET
      type = excluded.type,
      title = excluded.title,
      authors = excluded.authors,
      year = excluded.year,
      discipline = excluded.discipline,
      subdiscipline = excluded.subdiscipline,
      keywords = excluded.keywords,
      abstract = excluded.abstract,
      toc = excluded.toc,
      full_text_path = excluded.full_text_path,
      token_count = excluded.token_count,
      indexed_date = excluded.indexed_date,
      citation_info = excluded.citation_info,
      remark = excluded.remark,
      folder_name = excluded.folder_name,
      status = excluded.status,
      is_favorite = excluded.is_favorite,
      chapters = excluded.chapters
  `);

    let totalImported = 0;
    let totalErrors = 0;

    const insertMany = db.transaction(
        (records: Record<string, unknown>[]) => {
            for (const rec of records) {
                upsert.run(rec);
            }
        }
    );

    for (const { dir, type } of SOURCE_DIRS) {
        if (!fs.existsSync(dir)) {
            console.log(`⚠ Directory not found: ${dir}, skipping.`);
            continue;
        }

        const folders = fs
            .readdirSync(dir, { withFileTypes: true })
            .filter((d) => d.isDirectory());

        console.log(`\n📚 Scanning ${type} directory: ${dir}`);
        console.log(`   Found ${folders.length} subdirectories.`);

        const records: Record<string, unknown>[] = [];

        for (const folder of folders) {
            const metaPath = path.join(dir, folder.name, "metadata.json");
            if (!fs.existsSync(metaPath)) {
                console.log(`   ⚠ No metadata.json in ${folder.name}, skipping.`);
                totalErrors++;
                continue;
            }

            try {
                const raw = fs.readFileSync(metaPath, "utf-8");
                const meta = JSON.parse(raw);

                // Scan chapters folder for .md files
                const chaptersDir = path.join(dir, folder.name, "chapters");
                let chapters: string[] = [];
                if (fs.existsSync(chaptersDir)) {
                    chapters = fs
                        .readdirSync(chaptersDir, { withFileTypes: true })
                        .filter(f => f.isFile() && f.name.endsWith(".md"))
                        .map(f => f.name)
                        .sort();
                }

                records.push({
                    document_id: meta.document_id || `${type}-${folder.name}`,
                    type: meta.type || type,
                    title: meta.title || folder.name,
                    authors: JSON.stringify(meta.authors || []),
                    year: meta.year || null,
                    discipline: JSON.stringify(meta.discipline || []),
                    subdiscipline: JSON.stringify(meta.subdiscipline || []),
                    keywords: JSON.stringify(meta.keywords || []),
                    abstract: meta.abstract || "",
                    toc: meta.toc || "",
                    full_text_path: meta.full_text_path || "",
                    token_count: meta.token_count || 0,
                    indexed_date: meta.indexed_date || "",
                    citation_info: meta.citation_info || "",
                    remark: meta.remark || "",
                    folder_name: folder.name,
                    status: meta.status || "unread",
                    is_favorite: meta.is_favorite ? 1 : 0,
                    chapters: JSON.stringify(chapters),
                });
            } catch (err) {
                console.log(`   ✗ Error reading ${folder.name}: ${err}`);
                totalErrors++;
            }
        }

        // Batch insert in a single transaction
        insertMany(records);
        totalImported += records.length;
        console.log(`   ✓ Imported ${records.length} ${type}(s).`);
    }

    // Rebuild FTS index
    console.log("\n🔍 Rebuilding FTS index...");
    db.exec(`INSERT INTO documents_fts(documents_fts) VALUES('rebuild');`);

    db.close();
    console.log(`\n✅ Done! Total imported: ${totalImported}, Errors: ${totalErrors}`);
    console.log(`   Database: ${DB_PATH}`);
}

main();
