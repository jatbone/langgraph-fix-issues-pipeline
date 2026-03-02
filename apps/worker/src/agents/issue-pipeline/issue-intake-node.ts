/**
 * Issue Intake node — runs Claude CLI in a Docker container to analyze the issue
 * with codebase context. On ZodError, stores error in state for conditional retry.
 */

import type { TIssuePipelineGraphState } from "@langgraph-fix-issues-pipeline/backend";
import type Docker from "dockerode";
import { z, ZodError } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { streamExecInContainer } from "../../docker/index.js";
import { logger } from "./logger.js";
import { DEFAULT_FAST_MODEL } from "./constants.js";

const issueIntakeSchema = z.object({
  title: z.string().describe("Short descriptive title for the issue"),
  requirements: z
    .array(z.string())
    .describe("List of extracted requirements from the issue"),
  ambiguities: z
    .array(z.string())
    .describe("List of identified ambiguities or unclear aspects"),
  complexity: z
    .enum(["low", "medium", "high"])
    .describe("Estimated complexity of the issue"),
});

const issueIntakeJsonSchema = zodToJsonSchema(issueIntakeSchema);

export const createIssueIntakeNode = (docker: Docker, containerId: string) => {
  return async (state: TIssuePipelineGraphState) => {
    logger.nodeStart("issue_intake");
    try {
      if (!state.issue) {
        throw new Error("issue_intake requires state.issue");
      }
      const cleanedText = state.issue.cleaned;
      const fastModel = process.env.ANTHROPIC_FAST_MODEL || DEFAULT_FAST_MODEL;

      const prompt = [
        "Here is an issue to analyze in the context of this codebase:",
        "",
        cleanedText,
        "",
        "Parse this issue, extract requirements, identify ambiguities, and classify complexity.",
      ].join("\n");

      const result = await streamExecInContainer(docker, containerId, [
        "claude",
        "-p",
        prompt,
        "--model",
        fastModel,
        "--disallowedTools",
        "Bash(git *)",
        "mcp__github*",
        "--output-format",
        "stream-json",
        "--verbose",
        "--json-schema",
        JSON.stringify(issueIntakeJsonSchema),
        "--dangerously-skip-permissions",
      ], (event) => logger.cliEvent("issue_intake", event));

      const parsed = issueIntakeSchema.parse(result.structured_output);
      logger.log("issue_intake", "Result", parsed);
      logger.nodeEnd("issue_intake", `"${parsed.title}" (${parsed.complexity})`);

      return {
        issue: { ...state.issue, ...parsed },
        issueIntakeAttempts: state.issueIntakeAttempts + 1,
        result: { errors: [] },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("issue_intake", "Failed", { attempt: state.issueIntakeAttempts + 1, error: message });
      return {
        issueIntakeAttempts: state.issueIntakeAttempts + 1,
        result: {
          errors: [
            {
              node: "issue_intake",
              message,
              details: error instanceof ZodError ? error.issues : undefined,
            },
          ],
        },
      };
    }
  };
};
