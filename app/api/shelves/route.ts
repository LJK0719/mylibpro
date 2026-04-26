import { NextRequest, NextResponse } from "next/server";
import { createShelf, listShelves } from "@/lib/repositories/shelves";

// GET /api/shelves — 获取所有桌面书架
export async function GET() {
  return NextResponse.json(listShelves());
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

  try {
    const shelf = createShelf(name, description);
    return NextResponse.json(shelf, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("UNIQUE constraint failed")) {
      return NextResponse.json({ error: "该书架名称已存在" }, { status: 409 });
    }
    throw e;
  }
}
