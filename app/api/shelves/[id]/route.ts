import { NextRequest, NextResponse } from "next/server";
import { getDb, BookshelfRecord } from "@/lib/db";

// PATCH /api/shelves/[id] — 更新书架说明
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: { description?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const db = getDb();
  const shelf = db
    .prepare(`SELECT * FROM bookshelves WHERE shelf_id = ?`)
    .get(id) as BookshelfRecord | undefined;

  if (!shelf) {
    return NextResponse.json({ error: "书架不存在" }, { status: 404 });
  }

  if (body.description !== undefined) {
    db.prepare(`UPDATE bookshelves SET description = ? WHERE shelf_id = ?`).run(
      body.description,
      id
    );
  }

  const updated = db
    .prepare(`SELECT * FROM bookshelves WHERE shelf_id = ?`)
    .get(id) as BookshelfRecord;
  return NextResponse.json(updated);
}

// DELETE /api/shelves/[id] — 删除书架（并从所有文献中移除该书架引用）
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  const shelf = db
    .prepare(`SELECT * FROM bookshelves WHERE shelf_id = ?`)
    .get(id) as BookshelfRecord | undefined;

  if (!shelf) {
    return NextResponse.json({ error: "书架不存在" }, { status: 404 });
  }

  const shelfName = shelf.name;

  // Remove this shelf name from all documents that reference it
  const docs = db
    .prepare(`SELECT document_id, shelves FROM documents WHERE shelves LIKE ?`)
    .all(`%${shelfName}%`) as { document_id: string; shelves: string }[];

  const removeShelf = db.transaction(() => {
    for (const doc of docs) {
      const arr: string[] = JSON.parse(doc.shelves || "[]");
      const updated = arr.filter((s) => s !== shelfName);
      db.prepare(`UPDATE documents SET shelves = ? WHERE document_id = ?`).run(
        JSON.stringify(updated),
        doc.document_id
      );
    }
    db.prepare(`DELETE FROM bookshelves WHERE shelf_id = ?`).run(id);
  });

  removeShelf();

  return NextResponse.json({ ok: true });
}
