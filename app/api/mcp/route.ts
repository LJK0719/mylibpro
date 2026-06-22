/**
 * Remote MCP server (Streamable HTTP) for the library.
 *
 * Exposes the stateless library-api as 5 vectorless, token-lean tools so any
 * MCP-capable agent (Claude, Cursor, …) can use the library as an external
 * brain: search → outline (the map) → open (one node) → locate, with scope
 * pre-selection. Auth: same LIBRARY_API_KEYS as /api/v1 (header or ?key=).
 */

import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import {
    searchLibrary,
    getOutline,
    openNode,
    locateInDocument,
    getCollections,
} from "@/lib/library-api";
import { libraryEnv } from "@/lib/config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const scopeShape = {
    shelf: z.string().optional().describe("Limit to a bookshelf name (see library_collections)."),
    discipline: z.string().optional().describe("Limit to a discipline, e.g. 'statistics'."),
    type: z.enum(["book", "paper"]).optional().describe("Limit to books or papers."),
    document_ids: z
        .array(z.string())
        .optional()
        .describe("Pin an explicit working set, e.g. a main textbook id."),
};

const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }] });

const handler = createMcpHandler((server) => {
    server.registerTool(
        "library_search",
        {
            description:
                "Find documents in the user's academic library by lexical query (no vectors). Returns compact cards (id/title/authors/year/discipline/snippet). Next step: call library_outline on a chosen document_id. Use scope to pre-select a textbook or field.",
            inputSchema: {
                query: z.string().describe("Keywords in English, e.g. 'reproducing kernel hilbert space'."),
                limit: z.number().int().min(1).max(20).optional().describe("Max results (default 8)."),
                ...scopeShape,
            },
        },
        async ({ query, limit, shelf, discipline, type, document_ids }) =>
            json(searchLibrary({ query, limit, type, scope: { shelf, discipline, type, document_ids } })),
    );

    server.registerTool(
        "library_outline",
        {
            description:
                "Get a document's hierarchical outline (chapter→section tree) — titles + summaries, NO body text. This is the 'map': reason over it to pick which node to open. Pass node_id to expand a sub-branch; depth controls levels (default 2).",
            inputSchema: {
                document_id: z.string(),
                node_id: z.string().optional().describe("Expand under this node instead of the root."),
                depth: z.number().int().min(1).max(5).optional(),
            },
        },
        async ({ document_id, node_id, depth }) => json(getOutline({ documentId: document_id, nodeId: node_id, depth })),
    );

    server.registerTool(
        "library_open",
        {
            description:
                "Read the full text of ONE outline node (a section/subsection), bounded by max_tokens. Oversized nodes are truncated and return child_node_ids so you can drill into the exact branch. This is just-in-time retrieval — open only what you need.",
            inputSchema: {
                node_id: z.string().describe("A node_id from library_outline."),
                max_tokens: z.number().int().min(100).max(8000).optional().describe("Token budget (default 1500)."),
            },
        },
        async ({ node_id, max_tokens }) => json(openNode({ nodeId: node_id, maxTokens: max_tokens })),
    );

    server.registerTool(
        "library_locate",
        {
            description:
                "Keyword-locate inside a document: returns which outline nodes mention a term, with a short context line. Use to jump straight to the relevant branch before library_open.",
            inputSchema: {
                document_id: z.string(),
                keyword: z.string(),
                limit: z.number().int().min(1).max(20).optional(),
            },
        },
        async ({ document_id, keyword, limit }) => json(locateInDocument({ documentId: document_id, keyword, limit })),
    );

    server.registerTool(
        "library_collections",
        {
            description:
                "List the disciplines, bookshelves and types available, with counts — use these to pre-select a scope (e.g. a field's papers or a main textbook) for library_search.",
            inputSchema: {},
        },
        async () => json(getCollections()),
    );
}, undefined, { basePath: "/api" });

/** Reject before hitting the MCP handler when the API key is missing/invalid. */
function denyIfUnauthorized(req: Request): Response | null {
    const keys = libraryEnv.apiKeys;
    const deny = (status: number, error: string) =>
        new Response(JSON.stringify({ error }), { status, headers: { "content-type": "application/json" } });
    if (keys.length === 0) return deny(503, "Library API is not enabled. Set LIBRARY_API_KEYS on the server.");

    const url = new URL(req.url);
    const auth = req.headers.get("authorization");
    const key =
        req.headers.get("x-api-key")?.trim() ||
        (auth && /^bearer\s+/i.test(auth) ? auth.replace(/^bearer\s+/i, "").trim() : "") ||
        url.searchParams.get("key")?.trim() ||
        "";
    if (!key || !keys.includes(key)) return deny(401, "Unauthorized. Provide a valid key via X-API-Key, Authorization: Bearer, or ?key=.");
    return null;
}

async function guarded(req: Request): Promise<Response> {
    const denied = denyIfUnauthorized(req);
    if (denied) return denied;
    return handler(req);
}

export { guarded as GET, guarded as POST, guarded as DELETE };
