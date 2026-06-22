import { NextRequest, NextResponse } from "next/server";
import { locateInDocument } from "@/lib/library-api";
import { authorize } from "@/lib/library-api/auth";

// GET /api/v1/locate?document_id=...&keyword=...&limit=8
export async function GET(req: NextRequest) {
    const auth = authorize(req);
    if (!auth.ok) return auth.res;

    const sp = req.nextUrl.searchParams;
    const documentId = sp.get("document_id");
    const keyword = sp.get("keyword");
    if (!documentId || !keyword) {
        return NextResponse.json({ error: "document_id and keyword are required" }, { status: 400 });
    }
    const result = locateInDocument({
        documentId,
        keyword,
        limit: sp.get("limit") ? parseInt(sp.get("limit")!, 10) : undefined,
    });
    if ("error" in result) return NextResponse.json(result, { status: 404 });
    return NextResponse.json(result);
}
