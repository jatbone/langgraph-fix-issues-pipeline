/**
 * Log and Notify node — terminal node that logs the final pipeline state.
 * Will later be extended to write results to a DB.
 */

import type { TIssuePipelineGraphState } from "@langgraph-fix-issues-pipeline/shared/server";
import { logger } from "./logger.js";

export const createLogAndNotifyNode = () => {
  return async (state: TIssuePipelineGraphState) => {
    logger.summary(state);
    return {};
  };
};
