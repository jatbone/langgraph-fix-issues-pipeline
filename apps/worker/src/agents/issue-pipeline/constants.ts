/**
 * Constants for the issue pipeline graph.
 */

/** Node names — used in graph construction */
export const ISSUE_NODES = {
  CREATE_CONTAINER: "create_container",
  ISSUE_INTAKE: "issue_intake",
  CLEANUP_CONTAINER: "cleanup_container",
} as const;

/** Maximum number of container creation retries before giving up */
export const MAX_CONTAINER_CREATE_RETRIES = 2;
