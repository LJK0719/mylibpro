import { NextRequest, NextResponse } from "next/server";
import {
    getDocumentById,
    getDocumentViewById,
    updateDocumentFields,
    type DocumentPatchInput,
} from "@/lib/repositories/documents";
import fs from "fs";
import path from "path";

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
    
    let body: DocumentPatchInput;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const { authors, abstract, toc, remark, status, is_favorite, discipline, subdiscipline, keywords, shelves } = body;

    // 1. Check existing record
    const row = getDocumentById(id);
    if (!row) {
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // 2. Update SQLite
    updateDocumentFields(id, body);

    // 3. Update filesystem (metadata.json)
    const DATA_ROOT = process.env.DATA_ROOT || path.resolve(process.cwd(), "..", "data");
    const docType = row.type || "book";
    const folderName = row.folder_name;
    const metaPath = path.join(DATA_ROOT, docType, folderName, "metadata.json");

    try {
        if (fs.existsSync(metaPath)) {
            const raw = fs.readFileSync(metaPath, "utf-8");
            const meta = JSON.parse(raw);

            if (authors !== undefined) meta.authors = authors;
            if (abstract !== undefined) meta.abstract = abstract;
            if (toc !== undefined) meta.toc = toc;
            if (remark !== undefined) meta.remark = remark;
            if (status !== undefined) meta.status = status;
            if (is_favorite !== undefined) meta.is_favorite = is_favorite;
            if (discipline !== undefined) meta.discipline = discipline;
            if (subdiscipline !== undefined) meta.subdiscipline = subdiscipline;
            if (keywords !== undefined) meta.keywords = keywords;
            if (shelves !== undefined) meta.shelves = shelves;

            fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
        }
    } catch (e) {
        console.error("Failed to write metadata.json", e);
    }

    // Fetch and return the updated row
    const updatedRow = getDocumentViewById(id);
    return NextResponse.json(updatedRow);
}
