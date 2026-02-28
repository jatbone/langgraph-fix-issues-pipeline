/**
 * Lightweight logging helpers for pipeline nodes.
 * Prefixed, leveled output without external dependencies.
 */

import type { TIssuePipelineGraphState } from "@langgraph-fix-issues-pipeline/shared/server";

const formatMessage = (node: string, message: string): string =>
  `[${node}] ${message}`;

const formatData = (data: unknown): string =>
  typeof data === "string" ? data : JSON.stringify(data, null, 2);

export const logger = {
  log(node: string, message: string, data?: unknown): void {
    console.log(formatMessage(node, message));
    if (data !== undefined) {
      console.log(formatData(data));
    }
  },

  warn(node: string, message: string, data?: unknown): void {
    console.warn(formatMessage(node, message));
    if (data !== undefined) {
      console.warn(formatData(data));
    }
  },

  error(node: string, message: string, data?: unknown): void {
    console.error(formatMessage(node, message));
    if (data !== undefined) {
      console.error(formatData(data));
    }
  },

  separator(): void {
    console.log("─".repeat(60));
  },

  summary(state: TIssuePipelineGraphState): void {
    logger.separator();
    console.log("Pipeline Summary");
    logger.separator();

    if (state.issue?.title) {
      console.log(`  Issue:       ${state.issue.title}`);
      console.log(`  Complexity:  ${state.issue.complexity}`);
    }

    if (state.plan) {
      console.log(`  Plan scope:  ${state.plan.estimatedScope}`);
      console.log(`  Steps:       ${state.plan.steps.length}`);
    }

    if (state.coderResult) {
      console.log(`  Summary:     ${state.coderResult.summary}`);
      console.log(`  Files:       ${state.coderResult.filesChanged.join(", ")}`);
      console.log(`  Tests:       ${state.coderResult.testsPassed ? "passed" : "FAILED"}`);
      if (state.coderResult.testErrorSummary) {
        console.log(`  Test errors: ${state.coderResult.testErrorSummary}`);
      }
    }

    if (state.result.errors.length > 0) {
      console.log("");
      console.log("  Errors:");
      for (const err of state.result.errors) {
        console.log(`    - [${err.node}] ${err.message}`);
      }
    }

    logger.separator();
  },
};
