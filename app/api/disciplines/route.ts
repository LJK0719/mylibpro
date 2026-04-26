import { NextResponse } from "next/server";
import { getDisciplineFilters } from "@/lib/repositories/documents";

export async function GET() {
    return NextResponse.json(getDisciplineFilters());
}
