/**
 * Constants for the issue pipeline graph.
 */

/** Node names — used in graph construction */
export const ISSUE_NODES = {
  CREATE_CONTAINER: "create_container",
  ISSUE: "issue",
  CLEANUP_CONTAINER: "cleanup_container",
} as const;
