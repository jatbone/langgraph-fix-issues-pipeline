/**
 * Constants for the issue pipeline graph.
 */

/** Model for important tasks (plan, code, review) */
export const DEFAULT_MODEL = "sonnet";

/** Cheaper/faster model for simple nodes (intake, integrator) */
export const DEFAULT_FAST_MODEL = "haiku";

/** Git branch used when BASE_BRANCH env var is not set */
export const DEFAULT_BASE_BRANCH = "devel";

/** Max retries for Docker container creation */
export const CONTAINER_CREATION_MAX_ATTEMPTS = 2;

/** Max retries for issue intake parsing */
export const ISSUE_INTAKE_MAX_ATTEMPTS = 2;

/** Max retries for code review */
export const REVIEW_MAX_ATTEMPTS = 2;

/** Node names — used in graph construction */
export const ISSUE_NODES = {
  FORMAT_INPUT: "format_input",
  ISSUE_INTAKE: "issue_intake",
  PLAN_GENERATION: "plan_generation",
  CODE_IMPLEMENTATION: "code_implementation",
  CODE_REVIEW: "code_review",
  INTEGRATE: "integrate",
  LOG_AND_NOTIFY: "log_and_notify",
} as const;
