/**
 * Routing functions for the issue pipeline graph.
 * Each function examines the current state and returns the next node name.
 */

import type { TIssuePipelineGraphState } from "@langgraph-fix-issues-pipeline/backend";
import { ISSUE_INTAKE_MAX_ATTEMPTS, REVIEW_MAX_ATTEMPTS, ISSUE_NODES } from "./constants.js";

/** Fatal on error, otherwise proceed to intake. */
export const routeAfterFormatInput = (state: TIssuePipelineGraphState) => {
  if (state.result.errors.length > 0) {
    return ISSUE_NODES.LOG_AND_NOTIFY;
  }
  return ISSUE_NODES.ISSUE_INTAKE;
};

/** Retryable — succeed if title parsed, retry up to max attempts, then give up. */
export const routeAfterIssueIntake = (state: TIssuePipelineGraphState) => {
  if (state.issue?.title !== undefined) {
    return ISSUE_NODES.PLAN_GENERATION;
  }
  if (state.issueIntakeAttempts < ISSUE_INTAKE_MAX_ATTEMPTS) {
    return ISSUE_NODES.ISSUE_INTAKE;
  }
  return ISSUE_NODES.LOG_AND_NOTIFY;
};

/** Fatal on error, otherwise proceed to coder. */
export const routeAfterPlanGeneration = (state: TIssuePipelineGraphState) => {
  if (state.result.errors.length > 0) {
    return ISSUE_NODES.LOG_AND_NOTIFY;
  }
  return ISSUE_NODES.CODE_IMPLEMENTATION;
};

/** Fatal on error, otherwise proceed to review. */
export const routeAfterCodeImplementation = (state: TIssuePipelineGraphState) => {
  if (state.result.errors.length > 0) {
    return ISSUE_NODES.LOG_AND_NOTIFY;
  }
  return ISSUE_NODES.CODE_REVIEW;
};

/** Fatal on error. If rejected, loop back to coder up to max attempts. */
export const routeAfterCodeReview = (state: TIssuePipelineGraphState) => {
  if (state.result.errors.length > 0) {
    return ISSUE_NODES.LOG_AND_NOTIFY;
  }
  if (state.reviewResult?.approved) {
    return ISSUE_NODES.INTEGRATE;
  }
  if (state.reviewAttempts < REVIEW_MAX_ATTEMPTS) {
    return ISSUE_NODES.CODE_IMPLEMENTATION;
  }
  return ISSUE_NODES.LOG_AND_NOTIFY;
};
