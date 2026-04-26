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
import { buildSearchText } from "../lib/search/cjk";
import { expandDisciplineForSearch } from "../lib/search/disciplines";
import { normalizeMetadataI18n } from "../lib/i18n";

const PROJECT_ROOT = path.resolve(__dirname, "..");
loadEnvConfig(PROJECT_ROOT);

const DEFAULT_DATA_ROOT = "D:\\bookdata\\libdata";
const DATA_ROOT = process.env.DATA_ROOT || (fs.existsSync(DEFAULT_DATA_ROOT) ? DEFAULT_DATA_ROOT : path.resolve(PROJECT_ROOT, "..", "data"));
const DB_DIR = path.join(PROJECT_ROOT, "db");
const DB_PATH = process.env.DB_PATH ? path.resolve(PROJECT_ROOT, process.env.DB_PATH) : path.join(DB_DIR, "library.db");
const SOURCE_DIRS: { dir: string; type: string }[] = [
    { dir: path.join(DATA_ROOT, "book"), type: "book" },
    { dir: path.join(DATA_ROOT, "paper"), type: "paper" },
];

function ensureDbDir() {
    if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, { recursive: true });
    }
}

function openDb() {
    ensureDbDir();
    const db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    return db;
}

function initSchema(db: Database.Database) {
    db.exec(`
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
      search_text   TEXT NOT NULL DEFAULT ''
    );
  `);

    const cols = (db.pragma(`table_info(documents)`) as { name: string }[]).map((c) => c.name);
    const migrations: [string, string][] = [
        ["status", `ALTER TABLE documents ADD COLUMN status TEXT NOT NULL DEFAULT 'unread';`],
        ["is_favorite", `ALTER TABLE documents ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0;`],
        ["chapters", `ALTER TABLE documents ADD COLUMN chapters TEXT NOT NULL DEFAULT '[]';`],
        ["shelves", `ALTER TABLE documents ADD COLUMN shelves TEXT NOT NULL DEFAULT '[]';`],
        ["search_text", `ALTER TABLE documents ADD COLUMN search_text TEXT NOT NULL DEFAULT '';`],
        ["title_zh", `ALTER TABLE documents ADD COLUMN title_zh TEXT NOT NULL DEFAULT '';`],
        ["title_en", `ALTER TABLE documents ADD COLUMN title_en TEXT NOT NULL DEFAULT '';`],
        ["authors_zh", `ALTER TABLE documents ADD COLUMN authors_zh TEXT NOT NULL DEFAULT '[]';`],
        ["authors_en", `ALTER TABLE documents ADD COLUMN authors_en TEXT NOT NULL DEFAULT '[]';`],
        ["discipline_zh", `ALTER TABLE documents ADD COLUMN discipline_zh TEXT NOT NULL DEFAULT '[]';`],
        ["discipline_en", `ALTER TABLE documents ADD COLUMN discipline_en TEXT NOT NULL DEFAULT '[]';`],
        ["subdiscipline_zh", `ALTER TABLE documents ADD COLUMN subdiscipline_zh TEXT NOT NULL DEFAULT '[]';`],
        ["subdiscipline_en", `ALTER TABLE documents ADD COLUMN subdiscipline_en TEXT NOT NULL DEFAULT '[]';`],
        ["keywords_zh", `ALTER TABLE documents ADD COLUMN keywords_zh TEXT NOT NULL DEFAULT '[]';`],
        ["keywords_en", `ALTER TABLE documents ADD COLUMN keywords_en TEXT NOT NULL DEFAULT '[]';`],
        ["abstract_zh", `ALTER TABLE documents ADD COLUMN abstract_zh TEXT NOT NULL DEFAULT '';`],
        ["abstract_en", `ALTER TABLE documents ADD COLUMN abstract_en TEXT NOT NULL DEFAULT '';`],
        ["toc_zh", `ALTER TABLE documents ADD COLUMN toc_zh TEXT NOT NULL DEFAULT '';`],
        ["toc_en", `ALTER TABLE documents ADD COLUMN toc_en TEXT NOT NULL DEFAULT '';`],
    ];
    for (const [col, sql] of migrations) {
        if (!cols.includes(col)) {
            db.exec(sql);
            console.log(`   ✔ Migrated: added column '${col}'.`);
        }
    }

    db.exec(`
      DROP TRIGGER IF EXISTS documents_ai;
      DROP TRIGGER IF EXISTS documents_ad;
      DROP TRIGGER IF EXISTS documents_au;
      DROP TABLE IF EXISTS documents_fts;
    `);

    db.exec(`VACUUM;`);

    db.exec(`
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

    db.exec(`
    CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
      INSERT INTO documents_fts(rowid, document_id, title, authors, keywords, abstract, discipline, subdiscipline, search_text)
      VALUES (new.rowid, new.document_id, new.title, new.authors, new.keywords, new.abstract, new.discipline, new.subdiscipline, new.search_text);
    END;
  `);
    db.exec(`
    CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
      INSERT INTO documents_fts(documents_fts, rowid, document_id, title, authors, keywords, abstract, discipline, subdiscipline, search_text)
      VALUES ('delete', old.rowid, old.document_id, old.title, old.authors, old.keywords, old.abstract, old.discipline, old.subdiscipline, old.search_text);
    END;
  `);
    db.exec(`
    CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
      INSERT INTO documents_fts(documents_fts, rowid, document_id, title, authors, keywords, abstract, discipline, subdiscipline, search_text)
      VALUES ('delete', old.rowid, old.document_id, old.title, old.authors, old.keywords, old.abstract, old.discipline, old.subdiscipline, old.search_text);
      INSERT INTO documents_fts(rowid, document_id, title, authors, keywords, abstract, discipline, subdiscipline, search_text)
      VALUES (new.rowid, new.document_id, new.title, new.authors, new.keywords, new.abstract, new.discipline, new.subdiscipline, new.search_text);
    END;
  `);

    db.exec(`CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_documents_year ON documents(year);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_documents_is_favorite ON documents(is_favorite);`);
}

function makeSearchText(rec: Record<string, unknown>) {
    const i18n = normalizeMetadataI18n(rec);
    return buildSearchText(
        [rec.title, i18n.title.en, i18n.title.zh].join(" "),
        [...i18n.authors.en, ...i18n.authors.zh],
        [...i18n.keywords.en, ...i18n.keywords.zh],
        [rec.abstract, i18n.abstract.en, i18n.abstract.zh, i18n.toc.en, i18n.toc.zh].join(" "),
        expandDisciplineForSearch([...i18n.discipline.en, ...i18n.discipline.zh].join(" ")),
        expandDisciplineForSearch([...i18n.subdiscipline.en, ...i18n.subdiscipline.zh].join(" "))
    );
}

function buildRecord(folderName: string, type: string, meta: Record<string, unknown>, chapters: string[]) {
    const i18n = normalizeMetadataI18n(meta);
    return {
        document_id: meta.document_id || `${type}-${folderName}`,
        type: meta.type || type,
        title: meta.title || folderName,
        title_zh: i18n.title.zh,
        title_en: i18n.title.en,
        authors: JSON.stringify(meta.authors || []),
        authors_zh: JSON.stringify(i18n.authors.zh),
        authors_en: JSON.stringify(i18n.authors.en),
        year: meta.year || null,
        discipline: JSON.stringify(meta.discipline || []),
        discipline_zh: JSON.stringify(i18n.discipline.zh),
        discipline_en: JSON.stringify(i18n.discipline.en),
        subdiscipline: JSON.stringify(meta.subdiscipline || []),
        subdiscipline_zh: JSON.stringify(i18n.subdiscipline.zh),
        subdiscipline_en: JSON.stringify(i18n.subdiscipline.en),
        keywords: JSON.stringify(meta.keywords || []),
        keywords_zh: JSON.stringify(i18n.keywords.zh),
        keywords_en: JSON.stringify(i18n.keywords.en),
        abstract: meta.abstract || "",
        abstract_zh: i18n.abstract.zh,
        abstract_en: i18n.abstract.en,
        toc: meta.toc || "",
        toc_zh: i18n.toc.zh,
        toc_en: i18n.toc.en,
        full_text_path: meta.full_text_path || "",
        token_count: meta.token_count || 0,
        indexed_date: meta.indexed_date || "",
        citation_info: meta.citation_info || "",
        remark: meta.remark || "",
        folder_name: folderName,
        status: meta.status || "unread",
        is_favorite: meta.is_favorite ? 1 : 0,
        chapters: JSON.stringify(chapters),
        shelves: JSON.stringify(meta.shelves || []),
    } satisfies Record<string, unknown>;
}

function scanChapters(chaptersDir: string) {
    if (!fs.existsSync(chaptersDir)) return [];

    return fs
        .readdirSync(chaptersDir, { withFileTypes: true })
        .filter((f) => f.isFile() && f.name.endsWith(".md"))
        .map((f) => f.name)
        .sort();
}

function importOnce() {
    const db = openDb();

    try {
        initSchema(db);

        const upsert = db.prepare(`
    INSERT INTO documents (
      document_id, type, title, title_zh, title_en, authors, authors_zh, authors_en, year,
      discipline, discipline_zh, discipline_en, subdiscipline, subdiscipline_zh, subdiscipline_en,
      keywords, keywords_zh, keywords_en, abstract, abstract_zh, abstract_en, toc, toc_zh, toc_en,
      full_text_path, token_count, indexed_date,
      citation_info, remark, folder_name, status, is_favorite, chapters, shelves, search_text
    ) VALUES (
      @document_id, @type, @title, @title_zh, @title_en, @authors, @authors_zh, @authors_en, @year,
      @discipline, @discipline_zh, @discipline_en, @subdiscipline, @subdiscipline_zh, @subdiscipline_en,
      @keywords, @keywords_zh, @keywords_en, @abstract, @abstract_zh, @abstract_en, @toc, @toc_zh, @toc_en,
      @full_text_path, @token_count, @indexed_date,
      @citation_info, @remark, @folder_name, @status, @is_favorite, @chapters, @shelves, @search_text
    ) ON CONFLICT(document_id) DO UPDATE SET
      type = excluded.type,
      title = excluded.title,
      title_zh = excluded.title_zh,
      title_en = excluded.title_en,
      authors = excluded.authors,
      authors_zh = excluded.authors_zh,
      authors_en = excluded.authors_en,
      year = excluded.year,
      discipline = excluded.discipline,
      discipline_zh = excluded.discipline_zh,
      discipline_en = excluded.discipline_en,
      subdiscipline = excluded.subdiscipline,
      subdiscipline_zh = excluded.subdiscipline_zh,
      subdiscipline_en = excluded.subdiscipline_en,
      keywords = excluded.keywords,
      keywords_zh = excluded.keywords_zh,
      keywords_en = excluded.keywords_en,
      abstract = excluded.abstract,
      abstract_zh = excluded.abstract_zh,
      abstract_en = excluded.abstract_en,
      toc = excluded.toc,
      toc_zh = excluded.toc_zh,
      toc_en = excluded.toc_en,
      full_text_path = excluded.full_text_path,
      token_count = excluded.token_count,
      indexed_date = excluded.indexed_date,
      citation_info = excluded.citation_info,
      remark = excluded.remark,
      folder_name = excluded.folder_name,
      status = excluded.status,
      is_favorite = excluded.is_favorite,
      chapters = excluded.chapters,
      shelves = excluded.shelves,
      search_text = excluded.search_text
  `);

        let totalImported = 0;
        let totalErrors = 0;

        const insertMany = db.transaction((records: Record<string, unknown>[]) => {
            for (const rec of records) {
                upsert.run({
                    ...rec,
                    search_text: makeSearchText(rec),
                });
            }
        });

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
                    const meta = JSON.parse(raw) as Record<string, unknown>;
                    const chaptersDir = path.join(dir, folder.name, "chapters");
                    const chapters = scanChapters(chaptersDir);
                    const rec = buildRecord(folder.name, type, meta, chapters);
                    records.push(rec);
                } catch (err) {
                    console.log(`   ✗ Error reading ${folder.name}: ${err}`);
                    totalErrors++;
                }
            }

            insertMany(records);
            totalImported += records.length;
            console.log(`   ✓ Imported ${records.length} ${type}(s).`);
        }

        console.log("\n🔍 Rebuilding FTS index...");
        db.exec(`INSERT INTO documents_fts(documents_fts) VALUES('rebuild');`);

        console.log(`\n✅ Done! Total imported: ${totalImported}, Errors: ${totalErrors}`);
        console.log(`   Database: ${DB_PATH}`);
    } finally {
        db.close();
    }
}

function backupCorruptDatabase() {
    const suffix = new Date().toISOString().replace(/[:.]/g, "-");
    const backupBase = `${DB_PATH}.corrupt-${suffix}`;
    const files = [
        [DB_PATH, `${backupBase}.db`],
        [`${DB_PATH}-wal`, `${backupBase}.db-wal`],
        [`${DB_PATH}-shm`, `${backupBase}.db-shm`],
    ] as const;

    for (const [source, target] of files) {
        if (fs.existsSync(source)) {
            fs.renameSync(source, target);
        }
    }
}

function isCorruptDatabaseError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    return /SQLITE_CORRUPT_VTAB|database disk image is malformed/i.test(err.message);
}

function main() {
    try {
        importOnce();
    } catch (err) {
        if (!isCorruptDatabaseError(err)) {
            throw err;
        }

        console.log("⚠ Corrupt database detected, backing it up and rebuilding from source data...");
        backupCorruptDatabase();
        importOnce();
    }
}

main();
