/**
 * Constants for the issue pipeline graph.
 */

/** Claude model used when ANTHROPIC_MODEL env var is not set */
export const DEFAULT_ANTHROPIC_MODEL = "sonnet";

/** Git branch used when BASE_BRANCH env var is not set */
export const DEFAULT_BASE_BRANCH = "devel";

/** Max retries for Docker container creation */
export const COTAINER_CREATION_MAX_ATTEMPTS = 2;

/** Max retries for issue intake parsing */
export const ISSUE_INTAKE_MAX_ATTEMPTS = 2;

/** Max retries for code implementation */
export const CODER_MAX_ATTEMPTS = 2;

/** Max retries for code review */
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
