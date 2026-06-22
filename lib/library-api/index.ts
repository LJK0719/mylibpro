/**
 * library-api — stateless, token-lean external knowledge surface.
 *
 * Vectorless, hierarchical (PageIndex-style) navigation over the library,
 * shared by the REST routes (`/api/v1/*`) and the MCP server (`/api/mcp`).
 * Deliberately independent of the frontend agent's workspace machinery.
 */

export { searchLibrary } from "./search";
export { getOutline } from "./outline";
export { openNode } from "./open";
export { locateInDocument } from "./locate";
export { getCollections } from "./collections";
export type { DocCard, OutlineNode, LibraryScope, DocNodeRow } from "./types";
