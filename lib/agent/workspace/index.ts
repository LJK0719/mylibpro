/**
 * Workspace barrel — re-exports types, state mutators, and summary.
 *
 * Consumers import from `@/lib/agent/workspace`; this index keeps the
 * public surface stable while the implementation is split across
 * types.ts / state.ts / summary.ts.
 */

export * from "./types";
export * from "./state";
export * from "./summary";
