/**
 * Constants for the issue pipeline graph.
 */

export const DEFAULT_ANTHROPIC_MODEL = "sonnet";

export const COTAINER_CREATION_MAX_ATTEMPTS = 2;

export const ISSUE_INTAKE_MAX_ATTEMPTS = 2;

export const CODER_MAX_ATTEMPTS = 2;

export const REVIEW_MAX_ATTEMPTS = 2;

/** Node names — used in graph construction */
export const ISSUE_NODES = {
  FORMAT_INPUT: "format_input",
  ISSUE_INTAKE: "issue_intake",
  PLAN_GENERATION: "plan_generation",
  CODE_IMPLEMENTATION: "code_implementation",
  CODE_REVIEW: "code_review",
  LOG_AND_NOTIFY: "log_and_notify",
} as const;
