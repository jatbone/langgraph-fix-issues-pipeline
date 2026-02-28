/**
 * Constants for the issue pipeline graph.
 */

export const DEFAULT_ANTHROPIC_MODEL = "sonnet";

export const COTAINER_CREATION_MAX_ATTEMPTS = 2;

export const ISSUE_INTAKE_MAX_ATTEMPTS = 2;

/** Node names — used in graph construction */
export const ISSUE_NODES = {
  FORMAT_INPUT: "format_input",
  ISSUE_INTAKE: "issue_intake",
} as const;
