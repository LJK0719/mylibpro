import { NextRequest, NextResponse } from "next/server";
import { getOutline } from "@/lib/library-api";
import { authorize } from "@/lib/library-api/auth";

// GET /api/v1/outline?document_id=...&node_id=...&depth=2
export async function GET(req: NextRequest) {
    const auth = authorize(req);
    if (!auth.ok) return auth.res;

    const sp = req.nextUrl.searchParams;
    const documentId = sp.get("document_id");
    if (!documentId) {
        return NextResponse.json({ error: "document_id is required" }, { status: 400 });
    }
    const result = getOutline({
        documentId,
        nodeId: sp.get("node_id") || undefined,
        depth: sp.get("depth") ? parseInt(sp.get("depth")!, 10) : undefined,
    });
    if ("error" in result) return NextResponse.json(result, { status: 404 });
    return NextResponse.json(result);
}
