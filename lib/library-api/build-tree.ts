/**
 * Build a document's hierarchical node tree from its on-disk Markdown.
 *
 * No embeddings, no fixed-size chunking: we mirror the document's own logical
 * structure (chapters → Markdown headings → sub-headings). Each node records
 * the char range of its body inside a chapter file so the text can be sliced
 * on demand by `open`. This preserves the disciplinary/argument structure that
 * naive vector chunking destroys.
 */

import fs from "fs";
import { recordToView, type DocumentRecord } from "../db";
import { DATA_ROOT, joinDataPath, resolveFullTextPath } from "../agent/tools/_shared";
import type { DocNodeRow } from "./types";

const APPROX_CHARS_PER_TOKEN = 4;

interface Heading {
    depth: number; // number of leading '#'
    title: string;
    /** Offset of the heading line start within the file. */
    offset: number;
    /** Offset where the heading's own body begins (after the heading line). */
    bodyOffset: number;
}

/** Parse ATX Markdown headings, skipping fenced code blocks. */
function parseHeadings(text: string): Heading[] {
    const headings: Heading[] = [];
    let inFence = false;
    let fenceMarker = "";
    let offset = 0;

    for (const line of text.split("\n")) {
        const trimmed = line.trimStart();
        const fence = trimmed.match(/^(```+|~~~+)/);
        if (fence) {
            if (!inFence) {
                inFence = true;
                fenceMarker = fence[1][0];
            } else if (fence[1][0] === fenceMarker) {
                inFence = false;
            }
        } else if (!inFence) {
            const m = trimmed.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
            if (m) {
                headings.push({
                    depth: m[1].length,
                    title: m[2].trim(),
                    offset,
                    bodyOffset: offset + line.length + 1,
                });
            }
        }
        offset += line.length + 1; // +1 for the consumed "\n"
    }
    return headings;
}

function approxTokens(chars: number): number {
    return Math.max(0, Math.ceil(chars / APPROX_CHARS_PER_TOKEN));
}

/** Human-friendly chapter title from a chapter file name. */
function chapterTitleFromFile(fileName: string): string {
    return fileName
        .replace(/\.md$/i, "")
        .replace(/^\d+[_-]/, "")
        .replace(/_/g, " ")
        .replace(/\bChapter\b/i, "Chapter")
        .trim();
}

/**
 * Turn one Markdown file into a subtree under `parentId`/`baseLevel`, emitting
 * rows into `out`. The file itself is NOT a node here; its headings become the
 * nodes (the caller provides the container node, e.g. the chapter).
 */
function emitHeadingTree(opts: {
    out: DocNodeRow[];
    documentId: string;
    chapterFile: string;
    text: string;
    parentId: string;
    parentPath: string;
    baseLevel: number;
}): void {
    const { out, documentId, chapterFile, text, parentId, parentPath, baseLevel } = opts;
    const headings = parseHeadings(text);
    if (headings.length === 0) return;

    // Stack of open headings to resolve parent/child by markdown depth.
    const stack: { depth: number; nodeId: string; path: string; ordinalChild: number }[] = [];
    let rootOrdinal = 0;

    for (let i = 0; i < headings.length; i++) {
        const h = headings[i];
        // The node body spans until the next heading of equal-or-shallower depth.
        let end = text.length;
        for (let j = i + 1; j < headings.length; j++) {
            if (headings[j].depth <= h.depth) {
                end = headings[j].offset;
                break;
            }
        }

        // Pop deeper/sibling headings off the stack.
        while (stack.length > 0 && stack[stack.length - 1].depth >= h.depth) {
            stack.pop();
        }
        const parent = stack[stack.length - 1];
        const nodeParentId = parent ? parent.nodeId : parentId;
        const ordinal = parent ? parent.ordinalChild++ : rootOrdinal++;
        const nodeId = `${nodeParentId}.${ordinal}`;
        const level = baseLevel + stack.length;
        const headingPath = parentPath ? `${parentPath} > ${h.title}` : h.title;

        out.push({
            node_id: nodeId,
            document_id: documentId,
            parent_id: nodeParentId,
            level,
            ordinal,
            title: h.title,
            chapter_file: chapterFile,
            char_start: h.offset,
            char_end: end,
            token_count: approxTokens(end - h.offset),
            summary: "",
            heading_path: headingPath,
        });

        stack.push({ depth: h.depth, nodeId, path: headingPath, ordinalChild: 0 });
    }
}

/**
 * Build the full node tree for a document. Returns rows ready to insert into
 * `doc_nodes` (root first). Throws if no readable content is found.
 */
export function buildDocumentTree(rec: DocumentRecord): DocNodeRow[] {
    const view = recordToView(rec);
    const out: DocNodeRow[] = [];
    const rootId = view.document_id;

    // Root node (level 0): the document. Carries no body text (chapter_file = "").
    out.push({
        node_id: rootId,
        document_id: view.document_id,
        parent_id: null,
        level: 0,
        ordinal: 0,
        title: view.title,
        chapter_file: "",
        char_start: 0,
        char_end: 0,
        token_count: 0,
        summary: "",
        heading_path: view.title,
    });

    if (view.type === "book" && view.chapters.length > 0) {
        view.chapters.forEach((chapterFile, index) => {
            const chapterPath = joinDataPath(view.type, view.folder_name, "chapters", chapterFile);
            if (!fs.existsSync(chapterPath)) return;
            const text = fs.readFileSync(chapterPath, "utf-8");
            const chapterId = `${rootId}.${index}`;
            const chapterTitle = chapterTitleFromFile(chapterFile);

            // Level-1 chapter node spanning the whole file.
            out.push({
                node_id: chapterId,
                document_id: view.document_id,
                parent_id: rootId,
                level: 1,
                ordinal: index,
                title: chapterTitle,
                chapter_file: chapterFile,
                char_start: 0,
                char_end: text.length,
                token_count: approxTokens(text.length),
                summary: "",
                heading_path: chapterTitle,
            });

            emitHeadingTree({
                out,
                documentId: view.document_id,
                chapterFile,
                text,
                parentId: chapterId,
                parentPath: chapterTitle,
                baseLevel: 2,
            });
        });
    } else {
        // Paper / single-file document (or a book whose chapters were never
        // split). The recorded full_text_path can be stale (e.g. left pointing
        // at a "待解析" staging dir), so fall back to the standard locations —
        // same resilience as the regenerate route's resolveMarkdownPath.
        const relCandidates = [
            resolveFullTextPath(view),
            `${view.type}/${view.folder_name}/parsed/full_text.md`,
            `${view.type}/${view.folder_name}/full_text.md`,
            `${view.type}/${view.folder_name}/content.md`,
        ].filter(Boolean);
        const relPath = relCandidates.find((rel) => fs.existsSync(joinDataPath(rel))) || "";
        if (relPath) {
            const text = fs.readFileSync(joinDataPath(relPath), "utf-8");
            // Make the root openable: point it at the full text.
            out[0].chapter_file = relPath;
            out[0].char_end = text.length;
            out[0].token_count = approxTokens(text.length);
            emitHeadingTree({
                out,
                documentId: view.document_id,
                chapterFile: relPath,
                text,
                parentId: rootId,
                parentPath: view.title,
                baseLevel: 1,
            });
        }
    }

    if (out.length <= 1 && !out[0].chapter_file) {
        throw new Error(`No readable content found for document: ${view.document_id}`);
    }
    return out;
}

/** Convenience: read DATA_ROOT-relative content for a node row. */
export function readNodeText(row: Pick<DocNodeRow, "chapter_file" | "char_start" | "char_end" | "document_id">, view: { type: string; folder_name: string }): string {
    if (!row.chapter_file) return "";
    // chapter_file is either a bare chapter file name (book) or a DATA_ROOT-rel path (paper).
    const abs = row.chapter_file.includes("/") || row.chapter_file.includes("\\")
        ? joinDataPath(row.chapter_file)
        : joinDataPath(view.type, view.folder_name, "chapters", row.chapter_file);
    if (!fs.existsSync(abs)) return "";
    const text = fs.readFileSync(abs, "utf-8");
    return text.slice(row.char_start, row.char_end || text.length);
}

export const _internals = { parseHeadings, chapterTitleFromFile, DATA_ROOT };
