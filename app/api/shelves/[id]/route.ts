import { NextRequest, NextResponse } from "next/server";
import {
  deleteShelfAndDocumentReferences,
  getShelfById,
  updateShelfDescription,
} from "@/lib/repositories/shelves";

// PATCH /api/shelves/[id] — update a bookshelf's description.
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

  const shelf = getShelfById(id);

  if (!shelf) {
    return NextResponse.json({ error: "Shelf not found" }, { status: 404 });
  }

  const updated = body.description !== undefined
    ? updateShelfDescription(id, body.description)
    : shelf;
  return NextResponse.json(updated);
}

// DELETE /api/shelves/[id] — delete a bookshelf and remove its reference from every document.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const shelf = getShelfById(id);

  if (!shelf) {
    return NextResponse.json({ error: "Shelf not found" }, { status: 404 });
  }

  deleteShelfAndDocumentReferences(id, shelf.name);

  return NextResponse.json({ ok: true });
}
