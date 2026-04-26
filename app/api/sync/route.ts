import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { getDataRoot } from "@/lib/config";
import { rebuildDocumentsFts, upsertImportedDocuments } from "@/lib/repositories/documents";
import { normalizeMetadataI18n } from "@/lib/i18n";

export async function POST() {
    try {
        const DATA_ROOT = getDataRoot();

        const SOURCE_DIRS = [
            { dir: path.join(DATA_ROOT, "book"), type: "book" },
            { dir: path.join(DATA_ROOT, "paper"), type: "paper" },
        ];

        let totalImported = 0;
        let totalErrors = 0;

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
                    const i18n = normalizeMetadataI18n(meta);

                    const chaptersDir = path.join(dir, folder.name, "chapters");
                    const chapters: string[] = fs.existsSync(chaptersDir)
                        ? fs
                            .readdirSync(chaptersDir, { withFileTypes: true })
                            .filter(f => f.isFile() && f.name.endsWith(".md"))
                            .map(f => f.name)
                            .sort()
                        : [];

                    records.push({
                        document_id: meta.document_id || `${type}-${folder.name}`,
                        type: meta.type || type,
                        title: meta.title || folder.name,
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

            upsertImportedDocuments(records);
            totalImported += records.length;
        }

        rebuildDocumentsFts();

        return NextResponse.json({
            success: true,
            message: `Synced ${totalImported} document(s).`,
            totalImported,
            totalErrors,
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}
