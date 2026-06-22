/**
 * API-key auth + lightweight in-memory rate limiting for the external
 * library surface. Read-only; one shared key set (per-consumer keys can be
 * added later). Accepts the key via `X-API-Key`, `Authorization: Bearer`,
 * or `?key=` (for clients that can't set headers).
 */

import { NextRequest, NextResponse } from "next/server";
import { libraryEnv } from "../config";
import type { LibraryScope } from "./types";

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 60;
const buckets = new Map<string, { count: number; resetAt: number }>();

export function extractKey(req: NextRequest): string {
    const xkey = req.headers.get("x-api-key");
    if (xkey) return xkey.trim();
    const auth = req.headers.get("authorization");
    if (auth && auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
    const qk = req.nextUrl.searchParams.get("key");
    return qk ? qk.trim() : "";
}

/** Returns `{ ok }` or `{ ok:false, res }` with the error response to return. */
export function authorize(req: NextRequest): { ok: true } | { ok: false; res: NextResponse } {
    const keys = libraryEnv.apiKeys;
    if (keys.length === 0) {
        return {
            ok: false,
            res: NextResponse.json(
                { error: "Library API is not enabled. Set LIBRARY_API_KEYS on the server." },
                { status: 503 }
            ),
        };
    }

    const key = extractKey(req);
    if (!key || !keys.includes(key)) {
        return {
            ok: false,
            res: NextResponse.json(
                { error: "Unauthorized. Provide a valid key via X-API-Key, Authorization: Bearer, or ?key=." },
                { status: 401 }
            ),
        };
    }

    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt < now) {
        buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    } else {
        bucket.count += 1;
        if (bucket.count > MAX_PER_WINDOW) {
            return {
                ok: false,
                res: NextResponse.json(
                    { error: "Rate limit exceeded (60 req/min). Slow down." },
                    { status: 429 }
                ),
            };
        }
    }
    return { ok: true };
}

/** Parse a `scope` from query params shared by search/locate. */
export function parseScope(req: NextRequest): LibraryScope {
    const sp = req.nextUrl.searchParams;
    const type = sp.get("type");
    const docIds = sp.get("document_ids");
    return {
        shelf: sp.get("shelf") || undefined,
        discipline: sp.get("discipline") || undefined,
        type: type === "book" || type === "paper" ? type : undefined,
        document_ids: docIds ? docIds.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    };
}
