import { NextRequest, NextResponse } from "next/server";
import { getDb, DocumentRecord } from "@/lib/db";
import fs from "fs";
import path from "path";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  const row = db
    .prepare(`SELECT * FROM documents WHERE document_id = ?`)
    .get(id) as DocumentRecord | undefined;

  if (!row) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const DATA_ROOT = process.env.DATA_ROOT
    ? path.resolve(process.cwd(), process.env.DATA_ROOT)
    : path.resolve(process.cwd(), "libdata");

  const docType = row.type || "book";
  const folderName = row.folder_name;

  // PDF path: DATA_ROOT/book/[folder_name]/original.pdf
  const pdfPath = path.join(DATA_ROOT, docType, folderName, "original.pdf");

  if (!fs.existsSync(pdfPath)) {
    return NextResponse.json(
      { error: `PDF 文件不存在：${pdfPath}` },
      { status: 404 }
    );
  }

  const content = fs.readFileSync(pdfPath);
  const fileName = `${folderName || id}.pdf`;

  return new NextResponse(content, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
