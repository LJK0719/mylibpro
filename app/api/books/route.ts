import { NextRequest, NextResponse } from "next/server";
import { getDb, recordToView } from "@/lib/db";

export async function GET(req: NextRequest) {
    const db = getDb();
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
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const pageSize = Math.min(
        50,
        Math.max(1, parseInt(url.searchParams.get("pageSize") || "12"))
    );
    const sort = url.searchParams.get("sort") || "year_desc";

    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (q.trim()) {
        conditions.push(
            `d.document_id IN (SELECT document_id FROM documents_fts WHERE documents_fts MATCH @q)`
        );
        const escaped = q
            .trim()
            .replace(/['"]/g, "")
            .split(/\s+/)
            .map((t) => `"${t}"`)
            .join(" OR ");
        params.q = escaped;
    }

    if (type) {
        conditions.push(`d.type = @type`);
        params.type = type;
    }

    if (discipline) {
        conditions.push(`d.discipline LIKE @discipline`);
        params.discipline = `%${discipline}%`;
    }

    if (subdiscipline) {
        conditions.push(`d.subdiscipline LIKE @subdiscipline`);
        params.subdiscipline = `%${subdiscipline}%`;
    }

    if (yearFrom !== null) {
        conditions.push(`d.year >= @yearFrom`);
        params.yearFrom = yearFrom;
    }
    if (yearTo !== null) {
        conditions.push(`d.year <= @yearTo`);
        params.yearTo = yearTo;
    }

    const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    let orderClause = "ORDER BY d.year DESC, d.title ASC";
    switch (sort) {
        case "year_asc":
            orderClause = "ORDER BY d.year ASC, d.title ASC";
            break;
        case "year_desc":
            orderClause = "ORDER BY d.year DESC, d.title ASC";
            break;
        case "title_asc":
            orderClause = "ORDER BY d.title ASC";
            break;
        case "title_desc":
            orderClause = "ORDER BY d.title DESC";
            break;
        case "token_desc":
            orderClause = "ORDER BY d.token_count DESC";
            break;
    }

    const countRow = db
        .prepare(`SELECT COUNT(*) as total FROM documents d ${whereClause}`)
        .get(params) as { total: number };
    const total = countRow.total;

    const offset = (page - 1) * pageSize;
    const rows = db
        .prepare(
            `SELECT d.* FROM documents d ${whereClause} ${orderClause} LIMIT @limit OFFSET @offset`
        )
        .all({ ...params, limit: pageSize, offset }) as import("@/lib/db").DocumentRecord[];

    const books = rows.map(recordToView);

    return NextResponse.json({
        documents: books,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
    });
}
