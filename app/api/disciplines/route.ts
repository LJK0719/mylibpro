import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
    const db = getDb();

    // Extract all unique discipline values
    const rows = db
        .prepare(`SELECT DISTINCT discipline, subdiscipline FROM documents`)
        .all() as { discipline: string; subdiscipline: string }[];

    const disciplineSet = new Set<string>();
    const subdisciplineSet = new Set<string>();
    for (const row of rows) {
        const dArr: string[] = JSON.parse(row.discipline || "[]");
        for (const d of dArr) disciplineSet.add(d);
        const sArr: string[] = JSON.parse(row.subdiscipline || "[]");
        for (const s of sArr) subdisciplineSet.add(s);
    }

    const disciplines = Array.from(disciplineSet).sort();
    const subdisciplines = Array.from(subdisciplineSet).sort();

    // Types
    const typeRows = db
        .prepare(`SELECT DISTINCT type FROM documents ORDER BY type`)
        .all() as { type: string }[];
    const types = typeRows.map((r) => r.type);

    // Year range
    const yearRange = db
        .prepare(`SELECT MIN(year) as minYear, MAX(year) as maxYear FROM documents`)
        .get() as { minYear: number; maxYear: number };

    return NextResponse.json({
        disciplines,
        subdisciplines,
        types,
        yearRange: { min: yearRange.minYear, max: yearRange.maxYear },
    });
}
