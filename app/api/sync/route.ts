import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { getDb } from "@/lib/db";

export async function POST() {
    try {
        const DATA_ROOT = process.env.DATA_ROOT
            ? path.resolve(process.cwd(), process.env.DATA_ROOT)
            : path.resolve(process.cwd(), "..", "data");

        const SOURCE_DIRS = [
            { dir: path.join(DATA_ROOT, "book"), type: "book" },
            { dir: path.join(DATA_ROOT, "paper"), type: "paper" },
        ];

        const db = getDb();

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

        const insertMany = db.transaction((records: Record<string, unknown>[]) => {
            for (const rec of records) {
                upsert.run(rec);
            }
        });

        for (const { dir, type } of SOURCE_DIRS) {
            if (!fs.existsSync(dir)) continue;

            const folders = fs
                .readdirSync(dir, { withFileTypes: true })
                .filter((d) => d.isDirectory());

            const records: Record<string, unknown>[] = [];

            for (const folder of folders) {
                const metaPath = path.join(dir, folder.name, "metadata.json");
                if (!fs.existsSync(metaPath)) {
                    totalErrors++;
                    continue;
                }

                try {
                    const raw = fs.readFileSync(metaPath, "utf-8");
                    const meta = JSON.parse(raw);

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
                    console.error(`Error reading ${folder.name}:`, err);
                    totalErrors++;
                }
            }

            insertMany(records);
            totalImported += records.length;
        }

        db.exec(`INSERT INTO documents_fts(documents_fts) VALUES('rebuild');`);

        return NextResponse.json({
            success: true,
            message: `已成功同步 ${totalImported} 篇文献`,
            totalImported,
            totalErrors,
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}
