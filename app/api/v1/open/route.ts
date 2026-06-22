import { NextRequest, NextResponse } from "next/server";
import { openNode } from "@/lib/library-api";
import { authorize } from "@/lib/library-api/auth";

// GET /api/v1/open?node_id=...&max_tokens=1500
export async function GET(req: NextRequest) {
    const auth = authorize(req);
    if (!auth.ok) return auth.res;

    const sp = req.nextUrl.searchParams;
    const nodeId = sp.get("node_id");
    if (!nodeId) {
        return NextResponse.json({ error: "node_id is required" }, { status: 400 });
    }
    const result = openNode({
        nodeId,
        maxTokens: sp.get("max_tokens") ? parseInt(sp.get("max_tokens")!, 10) : undefined,
    });
    if ("error" in result) return NextResponse.json(result, { status: 404 });
    return NextResponse.json(result);
}
