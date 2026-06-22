import { NextRequest, NextResponse } from "next/server";
import { searchLibrary } from "@/lib/library-api";
import { authorize, parseScope } from "@/lib/library-api/auth";

// GET /api/v1/search?q=...&type=&shelf=&discipline=&document_ids=&limit=
export async function GET(req: NextRequest) {
    const auth = authorize(req);
    if (!auth.ok) return auth.res;

    const sp = req.nextUrl.searchParams;
    const scope = parseScope(req);
    const result = searchLibrary({
        query: sp.get("q") || "",
        scope,
        type: scope.type,
        limit: sp.get("limit") ? parseInt(sp.get("limit")!, 10) : undefined,
    });
    return NextResponse.json(result);
}
