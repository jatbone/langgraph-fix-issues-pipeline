/**
 * Log and Notify node — terminal node that logs the final pipeline state
 * and updates the issue status in the database when available.
 */

import type { TIssuePipelineGraphState, TDatabase } from "@langgraph-fix-issues-pipeline/backend";
import { markSuccess, markFailed } from "../../db/index.js";
import { logger } from "./logger.js";

export const createLogAndNotifyNode = (db: TDatabase | null = null) => {
  return async (state: TIssuePipelineGraphState) => {
    logger.summary(state);

    if (db && state.issueId) {
      const hasErrors = state.result.errors.length > 0;

      if (hasErrors) {
        const errorMessages = state.result.errors
          .map((e) => `[${e.node}] ${e.message}`)
          .join("; ");
        markFailed(db, state.issueId, errorMessages);
      } else {
        const summary = state.coderResult?.summary ?? "Pipeline completed";
        const prUrl = state.integratorResult?.prUrl ?? null;
        markSuccess(db, state.issueId, summary, prUrl);
      }
    }

    return {};
  };
};
