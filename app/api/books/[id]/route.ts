import { NextRequest, NextResponse } from "next/server";
import {
    getDocumentById,
    getDocumentViewById,
    updateDocumentFields,
    type DocumentPatchInput,
} from "@/lib/repositories/documents";
import { parseStringArray } from "@/lib/i18n";
import { syncBilingualTags, type TagFieldKind } from "@/lib/agent/translate-tags";
import fs from "fs";
import path from "path";

// PATCH body extends `DocumentPatchInput` with optional agent overrides used to
// authenticate the LLM call that synchronizes tag translations.
interface PatchBody extends DocumentPatchInput {
    provider?: string;
    apiKey?: string;
    model?: string;
    baseUrl?: string;
}

const TAG_FIELDS: TagFieldKind[] = ["authors", "discipline", "subdiscipline", "keywords"];

// Realign on-disk i18n arrays after the user edited the base list. Survivors keep
// their previous translation; new items default to the value itself for both locales.
function realignI18nField(meta: Record<string, unknown>, base: string, newValue: string[]) {
    const i18nKey = `${base}_i18n`;
    const existing = (meta[i18nKey] || {}) as Record<string, unknown>;
    const oldBase = parseStringArray(meta[base]);
    const oldZh = parseStringArray(existing.zh);
    const oldEn = parseStringArray(existing.en);
    const zh: string[] = [];
    const en: string[] = [];
    for (const item of newValue) {
        const idx = oldBase.indexOf(item);
        zh.push(idx >= 0 && oldZh[idx] ? oldZh[idx] : item);
        en.push(idx >= 0 && oldEn[idx] ? oldEn[idx] : item);
    }
    meta[base] = newValue;
    if (i18nKey in meta || existing.zh !== undefined || existing.en !== undefined) {
        meta[i18nKey] = { zh, en };
    }
}

// Overwrite the i18n block on disk with the bilingual arrays already synthesized
// by the LLM (or the realign helper). Always writes both locales so the file no
// longer carries stale entries.
function writeI18nField(meta: Record<string, unknown>, base: string, newValue: string[], zh: string[], en: string[]) {
    meta[base] = newValue;
    meta[`${base}_i18n`] = { zh, en };
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const row = getDocumentViewById(id);

    if (!row) {
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    return NextResponse.json(row);
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    let body: PatchBody;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const row = getDocumentById(id);
    if (!row) {
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const { provider, apiKey, model, baseUrl, ...patch } = body;
    const overrides = { provider, apiKey, model, baseUrl };

    // For each tag-array field present in the patch, realign translations from the
    // previous DB row, then call the LLM to fill any newly-added or never-translated
    // items. The LLM result becomes the authoritative `*_zh` / `*_en` for both the
    // SQLite update and the metadata.json sync below.
    const synced: Partial<Record<TagFieldKind, { base: string[]; zh: string[]; en: string[] }>> = {};

    for (const field of TAG_FIELDS) {
        if (patch[field] === undefined) continue;
        const newBase = parseStringArray(patch[field]);
        const oldBase = parseStringArray(row[field]);
        const oldZh = parseStringArray(row[`${field}_zh` as const]);
        const oldEn = parseStringArray(row[`${field}_en` as const]);

        // Step 1: preserve existing translations for survivors (matched by value).
        const seedZh: string[] = [];
        const seedEn: string[] = [];
        for (const item of newBase) {
            const idx = oldBase.indexOf(item);
            seedZh.push(idx >= 0 && oldZh[idx] ? oldZh[idx] : "");
            seedEn.push(idx >= 0 && oldEn[idx] ? oldEn[idx] : "");
        }

        // Step 2: ask the LLM to fill missing locales for newly-added items.
        const result = await syncBilingualTags({
            kind: field,
            base: newBase,
            existingZh: seedZh,
            existingEn: seedEn,
            overrides,
        });
        if (result.error) {
            return NextResponse.json(
                {
                    error: `Failed to translate ${field} tags: ${result.error}`,
                    field,
                },
                { status: 502 }
            );
        }
        synced[field] = { base: newBase, zh: result.zh, en: result.en };
    }

    // Build the repository patch with explicit zh/en triplets so the DB write
    // bypasses the survival-only realign and uses the LLM-synthesized arrays.
    const repoPatch: DocumentPatchInput = { ...patch };
    for (const field of TAG_FIELDS) {
        const s = synced[field];
        if (!s) continue;
        repoPatch[field] = s.base;
        repoPatch[`${field}_zh` as const] = s.zh;
        repoPatch[`${field}_en` as const] = s.en;
    }

    updateDocumentFields(id, repoPatch);

    // Mirror the change into metadata.json so a future /api/sync re-import
    // doesn't resurrect stale translations.
    const DATA_ROOT = process.env.DATA_ROOT || path.resolve(process.cwd(), "..", "data");
    const docType = row.type || "book";
    const folderName = row.folder_name;
    const metaPath = path.join(DATA_ROOT, docType, folderName, "metadata.json");

    try {
        if (fs.existsSync(metaPath)) {
            const raw = fs.readFileSync(metaPath, "utf-8");
            const meta = JSON.parse(raw);

            for (const field of TAG_FIELDS) {
                const s = synced[field];
                if (s) {
                    writeI18nField(meta, field, s.base, s.zh, s.en);
                } else if (patch[field] !== undefined) {
                    // No LLM sync (defensive path): preserve survivors only.
                    realignI18nField(meta, field, parseStringArray(patch[field]));
                }
            }

            if (patch.abstract !== undefined) meta.abstract = patch.abstract;
            if (patch.toc !== undefined) meta.toc = patch.toc;
            if (patch.remark !== undefined) meta.remark = patch.remark;
            if (patch.status !== undefined) meta.status = patch.status;
            if (patch.is_favorite !== undefined) meta.is_favorite = patch.is_favorite;
            if (patch.shelves !== undefined) meta.shelves = patch.shelves;

            fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
        }
    } catch (e) {
        console.error("Failed to write metadata.json", e);
    }

    const updatedRow = getDocumentViewById(id);
    return NextResponse.json(updatedRow);
}
