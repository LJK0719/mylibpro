import { NextRequest, NextResponse } from "next/server";
import { getDataRoot } from "@/lib/config";
import { getDocumentById } from "@/lib/repositories/documents";
import type { DocumentRecord } from "@/lib/db";
import fs from "fs";
import path from "path";

function safeFileName(name: string, extension: string) {
  const base = name
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return `${base || "document"}.${extension}`;
}

function resolveMarkdownPath(row: DocumentRecord, dataRoot: string) {
  let fullTextPath = row.full_text_path || "";
  if (fullTextPath.startsWith("library/")) {
    fullTextPath = fullTextPath.replace(/^library\//, "");
  }

  const candidates = [
    fullTextPath ? path.join(dataRoot, fullTextPath) : "",
    path.join(dataRoot, row.type || "book", row.folder_name || row.document_id, "content.md"),
  ].filter(Boolean);

  return candidates.find((candidate) => {
    const resolved = path.resolve(candidate);
    return resolved.startsWith(dataRoot) && fs.existsSync(resolved);
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const row = getDocumentById(id);

  if (!row) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const DATA_ROOT = getDataRoot();

  const docType = row.type || "book";
  const folderName = row.folder_name;
  const format = req.nextUrl.searchParams.get("format") || "pdf";

  if (format === "markdown" || format === "md") {
    const markdownPath = resolveMarkdownPath(row, DATA_ROOT);

    if (!markdownPath) {
      return NextResponse.json(
        { error: `Markdown file not found for document: ${id}` },
        { status: 404 }
      );
    }

    const content = fs.readFileSync(markdownPath, "utf-8");
    const fileName = safeFileName(folderName || row.title || id, "md");

    return new NextResponse(content, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
  }

  // PDF path: DATA_ROOT/book/[folder_name]/original.pdf
  const pdfPath = path.join(DATA_ROOT, docType, folderName, "original.pdf");

  if (!fs.existsSync(pdfPath)) {
    return NextResponse.json(
      { error: `PDF 文件不存在：${pdfPath}` },
      { status: 404 }
    );
  }

  const content = fs.readFileSync(pdfPath);
  const fileName = safeFileName(folderName || row.title || id, "pdf");

  return new NextResponse(content, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
