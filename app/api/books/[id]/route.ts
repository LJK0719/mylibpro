import { NextRequest, NextResponse } from "next/server";
import { getDb, recordToView, DocumentRecord } from "@/lib/db";
import fs from "fs";
import path from "path";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const db = getDb();

    const row = db
        .prepare(`SELECT * FROM documents WHERE document_id = ?`)
        .get(id) as DocumentRecord | undefined;

    if (!row) {
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    return NextResponse.json(recordToView(row));
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    
    let body;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    
    const { remark, status, is_favorite, discipline, subdiscipline, shelves } = body;

    const db = getDb();

    // 1. Check existing record
    const row = db.prepare(`SELECT * FROM documents WHERE document_id = ?`).get(id) as DocumentRecord | undefined;
    if (!row) {
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // 2. Update SQLite
    const updates: string[] = [];
    const values: any[] = [];
    if (remark !== undefined) {
        updates.push("remark = ?");
        values.push(remark);
    }
    if (status !== undefined) {
        updates.push("status = ?");
        values.push(status);
    }
    if (is_favorite !== undefined) {
        updates.push("is_favorite = ?");
        values.push(is_favorite ? 1 : 0);
    }
    if (discipline !== undefined) {
        updates.push("discipline = ?");
        values.push(JSON.stringify(Array.isArray(discipline) ? discipline : []));
    }
    if (subdiscipline !== undefined) {
        updates.push("subdiscipline = ?");
        values.push(JSON.stringify(Array.isArray(subdiscipline) ? subdiscipline : []));
    }
    if (shelves !== undefined) {
        updates.push("shelves = ?");
        values.push(JSON.stringify(Array.isArray(shelves) ? shelves : []));
    }

    if (updates.length > 0) {
        values.push(id);
        db.prepare(`UPDATE documents SET ${updates.join(", ")} WHERE document_id = ?`).run(...values);
    }

    // 3. Update filesystem (metadata.json)
    const DATA_ROOT = process.env.DATA_ROOT || path.resolve(process.cwd(), "..", "data");
    const docType = row.type || "book";
    const folderName = row.folder_name;
    const metaPath = path.join(DATA_ROOT, docType, folderName, "metadata.json");

    try {
        if (fs.existsSync(metaPath)) {
            const raw = fs.readFileSync(metaPath, "utf-8");
            const meta = JSON.parse(raw);

            if (remark !== undefined) meta.remark = remark;
            if (status !== undefined) meta.status = status;
            if (is_favorite !== undefined) meta.is_favorite = is_favorite;
            if (discipline !== undefined) meta.discipline = discipline;
            if (subdiscipline !== undefined) meta.subdiscipline = subdiscipline;
            if (shelves !== undefined) meta.shelves = shelves;

            fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
        }
    } catch (e) {
        console.error("Failed to write metadata.json", e);
    }

    // Fetch and return the updated row
    const updatedRow = db.prepare(`SELECT * FROM documents WHERE document_id = ?`).get(id) as DocumentRecord;
    return NextResponse.json(recordToView(updatedRow));
}
