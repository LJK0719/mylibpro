/**
 * Build the hierarchical navigation index (doc_nodes) for the library.
 *
 * This powers the external, vectorless library-api: each document is parsed
 * into a chapter→section tree so agents can navigate by structure instead of
 * loading whole files. Idempotent: rebuilds nodes per document.
 *
 * Usage:
 *   npx tsx scripts/build-index.ts                 # all documents
 *   npx tsx scripts/build-index.ts --doc <id>      # one document
 *
 * On the production VPS, pass the host paths:
 *   DB_PATH=/opt/mylibpro/db/library.db DATA_ROOT=/opt/mylibpro/libdata \
 *     npx tsx scripts/build-index.ts
 */

import path from "path";
import { loadEnvConfig } from "@next/env";
// Type-only import is erased at compile time, so it does NOT load lib/db
// (and resolve DB_PATH) before loadEnvConfig() runs below.
import type { DocumentRecord as Rec } from "../lib/db";

loadEnvConfig(path.resolve(__dirname, ".."));

async function main() {
    // Dynamic import so loadEnvConfig() runs before lib/db resolves DB_PATH.
    const { getDb } = await import("../lib/db");
    const { buildDocumentTree } = await import("../lib/library-api/build-tree");

    const args = process.argv.slice(2);
    const docFlag = args.indexOf("--doc");
    const onlyDoc = docFlag >= 0 ? args[docFlag + 1] : null;

    const db = getDb();
    const rows = onlyDoc
        ? (db.prepare(`SELECT * FROM documents WHERE document_id = ?`).all(onlyDoc) as Rec[])
        : (db.prepare(`SELECT * FROM documents`).all() as Rec[]);

    if (rows.length === 0) {
        console.error(onlyDoc ? `Document not found: ${onlyDoc}` : "No documents in database.");
        process.exit(1);
    }

    const del = db.prepare(`DELETE FROM doc_nodes WHERE document_id = ?`);
    const ins = db.prepare(`
        INSERT INTO doc_nodes
          (node_id, document_id, parent_id, level, ordinal, title, chapter_file, char_start, char_end, token_count, summary, heading_path)
        VALUES
          (@node_id, @document_id, @parent_id, @level, @ordinal, @title, @chapter_file, @char_start, @char_end, @token_count, @summary, @heading_path)
    `);

    let docCount = 0;
    let nodeCount = 0;
    let failed = 0;

    for (const rec of rows) {
        try {
            const nodes = buildDocumentTree(rec);
            const tx = db.transaction(() => {
                del.run(rec.document_id);
                for (const n of nodes) ins.run(n);
            });
            tx();
            docCount++;
            nodeCount += nodes.length;
            console.log(`✓ ${rec.document_id} → ${nodes.length} nodes`);
        } catch (err) {
            failed++;
            console.warn(`✗ ${rec.document_id}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    console.log(`\nDone. ${docCount} documents, ${nodeCount} nodes${failed ? `, ${failed} failed` : ""}.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
