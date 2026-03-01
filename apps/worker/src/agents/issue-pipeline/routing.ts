/**
 * Routing functions for the issue pipeline graph.
 * Each function examines the current state and returns the next node name.
 */

import type { TIssuePipelineGraphState } from "@langgraph-fix-issues-pipeline/backend";
import { ISSUE_INTAKE_MAX_ATTEMPTS, REVIEW_MAX_ATTEMPTS, ISSUE_NODES } from "./constants.js";

export const routeAfterFormatInput = (state: TIssuePipelineGraphState) => {
  if (state.result.errors.length > 0) {
    return ISSUE_NODES.LOG_AND_NOTIFY;
  }
  return ISSUE_NODES.ISSUE_INTAKE;
};

export const routeAfterIssueIntake = (state: TIssuePipelineGraphState) => {
  if (state.issue?.title !== undefined) {
    return ISSUE_NODES.PLAN_GENERATION;
  }
  if (state.issueIntakeAttempts < ISSUE_INTAKE_MAX_ATTEMPTS) {
    return ISSUE_NODES.ISSUE_INTAKE;
  }
  return ISSUE_NODES.LOG_AND_NOTIFY;
};

export const routeAfterPlanGeneration = (state: TIssuePipelineGraphState) => {
  if (state.result.errors.length > 0) {
    return ISSUE_NODES.LOG_AND_NOTIFY;
  }
  return ISSUE_NODES.CODE_IMPLEMENTATION;
};

export const routeAfterCodeImplementation = (state: TIssuePipelineGraphState) => {
  if (state.result.errors.length > 0) {
    return ISSUE_NODES.LOG_AND_NOTIFY;
  }
  return ISSUE_NODES.CODE_REVIEW;
};

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
