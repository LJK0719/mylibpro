import { NextRequest, NextResponse } from "next/server";
import { createShelf, listShelves } from "@/lib/repositories/shelves";

// GET /api/shelves — list all bookshelves.
export async function GET() {
  return NextResponse.json(listShelves());
}

// POST /api/shelves — create a new bookshelf.
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
    return NextResponse.json({ error: "Shelf name is required" }, { status: 400 });
  }

  try {
    const shelf = createShelf(name, description);
    return NextResponse.json(shelf, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("UNIQUE constraint failed")) {
      return NextResponse.json({ error: "Shelf name already exists" }, { status: 409 });
    }
    throw e;
  }
}
