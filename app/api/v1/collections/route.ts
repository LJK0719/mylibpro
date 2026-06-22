import { NextRequest, NextResponse } from "next/server";
import { getCollections } from "@/lib/library-api";
import { authorize } from "@/lib/library-api/auth";

// GET /api/v1/collections — disciplines / shelves / types for scope selection
export async function GET(req: NextRequest) {
    const auth = authorize(req);
    if (!auth.ok) return auth.res;
    return NextResponse.json(getCollections());
}
