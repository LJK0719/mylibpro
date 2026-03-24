import { NextRequest, NextResponse } from "next/server";
import { getDb, BookshelfRecord } from "@/lib/db";
import { randomUUID } from "crypto";

// GET /api/shelves — 获取所有桌面书架
export async function GET() {
  const db = getDb();
  const shelves = db
    .prepare(`SELECT * FROM bookshelves ORDER BY created_at ASC`)
    .all() as BookshelfRecord[];
  return NextResponse.json(shelves);
}

// POST /api/shelves — 新建桌面书架
export async function POST(req: NextRequest) {
  let body: { name?: string; description?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = (body.name || "").trim();
  const description = (body.description || "").trim();

  if (!name) {
    return NextResponse.json({ error: "书架名称不能为空" }, { status: 400 });
  }

  const db = getDb();
  const shelf_id = randomUUID();

  try {
    db.prepare(
      `INSERT INTO bookshelves (shelf_id, name, description) VALUES (?, ?, ?)`
    ).run(shelf_id, name, description);
  } catch (e: any) {
    if (e.message?.includes("UNIQUE constraint failed")) {
      return NextResponse.json({ error: "该书架名称已存在" }, { status: 409 });
    }
    throw e;
  }

  const shelf = db
    .prepare(`SELECT * FROM bookshelves WHERE shelf_id = ?`)
    .get(shelf_id) as BookshelfRecord;

  return NextResponse.json(shelf, { status: 201 });
}
