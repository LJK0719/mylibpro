import { NextResponse } from "next/server";

// GET /api/v1 — public, key-free discovery manifest for the external library API.
export async function GET() {
    return NextResponse.json({
        name: "mylibpro-library-api",
        description:
            "Vectorless, hierarchical (PageIndex-style) access to a curated academic library. Search → outline (the map) → open one node → locate. Token-lean, multi-round, stateless.",
        auth: "Send your key via 'X-API-Key', 'Authorization: Bearer', or '?key='.",
        mcp_endpoint: "/api/mcp",
        skill_install: "curl -fsSL <origin>/install.sh | bash -s -- <API_KEY>",
        endpoints: {
            "GET /api/v1/search": "q, type?, shelf?, discipline?, document_ids?, limit? → document cards",
            "GET /api/v1/outline": "document_id, node_id?, depth? → hierarchical outline (no body text)",
            "GET /api/v1/open": "node_id, max_tokens? → one node's full text",
            "GET /api/v1/locate": "document_id, keyword, limit? → nodes mentioning the term",
            "GET /api/v1/collections": "→ disciplines / shelves / types for scope selection",
        },
    });
}
