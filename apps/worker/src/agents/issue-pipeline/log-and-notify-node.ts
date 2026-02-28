/**
 * Log and Notify node — terminal node that logs the final pipeline state.
 * Will later be extended to write results to a DB.
 */

import type { TIssuePipelineGraphState } from "@langgraph-fix-issues-pipeline/shared/server";

export const createLogAndNotifyNode = () => {
  return async (state: TIssuePipelineGraphState) => {
    if (state.result.errors.length > 0) {
      console.error("Pipeline finished with errors:", state.result.errors);
    } else {
      console.log(
        `Pipeline finished successfully — issue: "${state.issue?.title}"`,
      );
    }

    return {};
  };
};
