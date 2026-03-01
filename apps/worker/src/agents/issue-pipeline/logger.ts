/**
 * Lightweight logging helpers for pipeline nodes.
 * Prefixed, leveled output without external dependencies.
 */

import type { TIssuePipelineGraphState } from "@langgraph-fix-issues-pipeline/backend";
import type { TStreamEvent } from "../../docker/index.js";

const isDebug = process.env.IS_DEBUG === "true" || process.env.IS_DEBUG === "'true'";

const MAX_TEXT_BLOCK_LENGTH_IN_DEBUG = 1000;
const MAX_BASH_COMMAND_LENGTH_IN_DEBUG = 1000;
const MAX_GREP_PATTERN_LENGTH_IN_DEBUG = 500;
const MAX_AGENT_DESCRIPTION_LENGTH_IN_DEBUG = 500;

const formatMessage = (node: string, message: string): string =>
  `[${node}] ${message}`;

const formatData = (data: unknown): string =>
  typeof data === "string" ? data : JSON.stringify(data, null, 2);

const truncate = (str: string, max: number): string =>
  str.length > max ? str.slice(0, max) + "…" : str;

const formatToolInput = (name: string, input?: Record<string, unknown>): string => {
  if (!input) {
    return `Tool: ${name}`;
  }

  switch (name) {
    case "Read":
      return `Read ${input.file_path ?? ""}`;
    case "Write":
      return `Write ${input.file_path ?? ""}`;
    case "Edit":
      return `Edit ${input.file_path ?? ""}`;
    case "Glob":
      return `Glob ${input.pattern ?? ""}`;
    case "Grep":
      return `Grep ${truncate(String(input.pattern ?? ""), MAX_GREP_PATTERN_LENGTH_IN_DEBUG)}`;
    case "Bash":
      return `Bash ${truncate(String(input.command ?? ""), MAX_BASH_COMMAND_LENGTH_IN_DEBUG)}`;
    case "Agent":
      return `Agent: ${truncate(String(input.description ?? input.prompt ?? ""), MAX_AGENT_DESCRIPTION_LENGTH_IN_DEBUG)}`;
    default:
      return `Tool: ${name}`;
  }
};

export const logger = {
  nodeStart(node: string): void {
    console.log(formatMessage(node, "Starting..."));
    console.log("");
  },

  nodeEnd(node: string, result: string): void {
    console.log("");
    console.log(formatMessage(node, `Done — ${result}`));
  },

  log(node: string, message: string, data?: unknown): void {
    console.log(formatMessage(node, message));
    if (data !== undefined && isDebug) {
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

  cliEvent(node: string, event: TStreamEvent): void {
    if (!isDebug) {
      return;
    }

    const prefix = `[${node}] ↳ `;

    if (event.type === "assistant") {
      const message = event.message as { content?: unknown } | undefined;
      const content = (Array.isArray(event.content) ? event.content : Array.isArray(message?.content) ? message.content : null) as Array<{ type: string; name?: string; input?: Record<string, unknown>; text?: string }> | null;
      if (!content) {
        return;
      }
      for (const block of content) {
        if (block.type === "tool_use") {
          console.log(`${prefix}${formatToolInput(block.name ?? "unknown", block.input)}`);
        } else if (block.type === "text" && block.text) {
          const preview = block.text.length > MAX_TEXT_BLOCK_LENGTH_IN_DEBUG ? block.text.slice(0, MAX_TEXT_BLOCK_LENGTH_IN_DEBUG) + "..." : block.text;
          console.log(`${prefix}${preview}`);
        }
      }
    } else if (event.type === "result") {
      const costField = event.total_cost_usd ?? event.cost_usd;
      const cost = typeof costField === "number" ? `$${costField.toFixed(2)}` : "unknown";
      const turns = typeof event.num_turns === "number" ? event.num_turns : "?";
      console.log(`${prefix}Completed (cost: ${cost}, turns: ${turns})`);
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
    }

    if (state.reviewResult) {
      const r = state.reviewResult;
      console.log(`  Review:      ${r.approved ? "approved" : "REJECTED"}`);
      console.log(`  Review summary: ${r.summary}`);
      const errorCount = r.findings.filter((f) => f.severity === "error").length;
      const warnCount = r.findings.filter((f) => f.severity === "warning").length;
      const infoCount = r.findings.filter((f) => f.severity === "info").length;
      console.log(`  Findings:    ${errorCount} error, ${warnCount} warning, ${infoCount} info`);
      if (!r.testsPassed && r.testErrorSummary) {
        console.log(`  Review tests: FAILED — ${r.testErrorSummary}`);
      }
    }

    if (state.integratorResult) {
      console.log(`  Branch:      ${state.integratorResult.branchName}`);
      console.log(`  PR:          ${state.integratorResult.prUrl}`);
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
