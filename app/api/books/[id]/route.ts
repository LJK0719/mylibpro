import { NextRequest, NextResponse } from "next/server";
import { getDb, recordToView, DocumentRecord } from "@/lib/db";

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
