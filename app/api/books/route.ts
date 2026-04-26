import { NextRequest, NextResponse } from "next/server";
import { listDocuments } from "@/lib/repositories/documents";

export async function GET(req: NextRequest) {
    const url = req.nextUrl;

    const q = url.searchParams.get("q") || "";
    const type = url.searchParams.get("type") || "";
    const discipline = url.searchParams.get("discipline") || "";
    const subdiscipline = url.searchParams.get("subdiscipline") || "";
    const yearFrom = url.searchParams.get("yearFrom")
        ? parseInt(url.searchParams.get("yearFrom")!)
        : null;
    const yearTo = url.searchParams.get("yearTo")
        ? parseInt(url.searchParams.get("yearTo")!)
        : null;
    const favorite = url.searchParams.get("favorite") || "";
    const statusFilter = url.searchParams.get("status") || "";
    const shelf = url.searchParams.get("shelf") || "";
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const pageSize = Math.min(
        50,
        Math.max(1, parseInt(url.searchParams.get("pageSize") || "12"))
    );
    const sort = url.searchParams.get("sort") || "year_desc";

    const result = listDocuments({
        q,
        type,
        discipline,
        subdiscipline,
        yearFrom,
        yearTo,
        favorite,
        statusFilter,
        shelf,
        page,
        pageSize,
        sort,
    });

    return NextResponse.json(result);
}
