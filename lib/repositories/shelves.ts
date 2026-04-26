import { randomUUID } from "crypto";
import { getDb, type BookshelfRecord } from "../db";

export function listShelves(): BookshelfRecord[] {
    return getDb()
        .prepare(`SELECT * FROM bookshelves ORDER BY created_at ASC`)
        .all() as BookshelfRecord[];
}

export function createShelf(name: string, description: string): BookshelfRecord {
    const db = getDb();
    const shelf_id = randomUUID();

    db.prepare(
        `INSERT INTO bookshelves (shelf_id, name, description) VALUES (?, ?, ?)`
    ).run(shelf_id, name, description);

    return db
        .prepare(`SELECT * FROM bookshelves WHERE shelf_id = ?`)
        .get(shelf_id) as BookshelfRecord;
}

export function getShelfById(id: string): BookshelfRecord | undefined {
    return getDb()
        .prepare(`SELECT * FROM bookshelves WHERE shelf_id = ?`)
        .get(id) as BookshelfRecord | undefined;
}

export function updateShelfDescription(id: string, description: string): BookshelfRecord {
    const db = getDb();
    db.prepare(`UPDATE bookshelves SET description = ? WHERE shelf_id = ?`).run(
        description,
        id
    );
    return db
        .prepare(`SELECT * FROM bookshelves WHERE shelf_id = ?`)
        .get(id) as BookshelfRecord;
}

export function deleteShelfAndDocumentReferences(id: string, shelfName: string): void {
    const db = getDb();
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
}
