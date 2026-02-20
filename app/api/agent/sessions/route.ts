/**
 * POST /api/agent/sessions — create a new session
 * DELETE /api/agent/sessions — delete a session
 */

import { NextRequest, NextResponse } from "next/server";
import { createSession, deleteSession } from "@/lib/workspace";

export async function POST() {
    const sessionId = `session-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
    createSession(sessionId);
    return NextResponse.json({ sessionId });
}

export async function DELETE(req: NextRequest) {
    const { sessionId } = await req.json();
    if (sessionId) {
        deleteSession(sessionId);
    }
    return NextResponse.json({ ok: true });
}
