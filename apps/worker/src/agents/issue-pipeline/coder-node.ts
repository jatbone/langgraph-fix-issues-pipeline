/**
 * Coder node — runs Claude CLI in a Docker container to implement changes
 * based on the plan. Does not run tests — testing is handled by the review node.
 */

import type { TIssuePipelineGraphState } from "@langgraph-fix-issues-pipeline/shared/server";
import type Docker from "dockerode";
import { z, ZodError } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { execInContainer, streamExecInContainer } from "../../docker/index.js";
import { CODER_CONTRACT } from "./contracts.js";
import { logger } from "./logger.js";

const coderResultSchema = z.object({
  summary: z.string().describe("Summary of changes made"),
  filesChanged: z
    .array(z.string())
    .describe("List of files that were modified"),
});

const coderResultJsonSchema = zodToJsonSchema(coderResultSchema);

export const createCoderNode = (docker: Docker, containerId: string) => {
  return async (state: TIssuePipelineGraphState) => {
    logger.nodeStart("code_implementation");
    try {
      if (!state.issue) {
        throw new Error("coder requires state.issue");
      }
      if (!state.plan) {
        throw new Error("coder requires state.plan");
      }
      const issue = state.issue;
      const plan = state.plan;

      const escapedContract = CODER_CONTRACT.replace(/'/g, "'\\''");
      await execInContainer(docker, containerId, [
        "sh",
        "-c",
        `echo '${escapedContract}' > /workspace/coder-rules.md`,
      ]);

      const promptParts = [
        `Issue: ${issue.title}`,
        "",
        "Requirements:",
        ...issue.requirements.map((r) => `- ${r}`),
        "",
        `Approach: ${plan.approach}`,
        "",
        "Steps:",
        ...plan.steps.map((s, i) => `${i + 1}. ${s}`),
        "",
        "Files to modify:",
        ...plan.filesToModify.map((f) => `- ${f}`),
        "",
        "Implement all changes and return the result.",
      ];

      if (state.reviewResult && !state.reviewResult.approved) {
        promptParts.push(
          "",
          "CODE REVIEW FEEDBACK — address these findings:",
          state.reviewResult.summary,
          "",
          ...state.reviewResult.findings
            .filter((f) => f.severity === "error" || f.severity === "warning")
            .map((f) => `- [${f.severity}] ${f.file}:${f.line} (${f.category}): ${f.message}`),
          "",
          "Fix all error-severity findings and address warnings where possible.",
        );
        if (!state.reviewResult.testsPassed && state.reviewResult.testErrorSummary) {
          promptParts.push(
            "",
            "TEST FAILURES from review:",
            state.reviewResult.testErrorSummary,
            "",
            "Fix these test failures as well.",
          );
        }
      }

      const prompt = promptParts.join("\n");

      const result = await streamExecInContainer(docker, containerId, [
        "claude",
        "-p",
        prompt,
        "--allowedTools",
        "Bash,Read,Edit,Write,mcp",
        "--output-format",
        "stream-json",
        "--verbose",
        "--json-schema",
        JSON.stringify(coderResultJsonSchema),
        "--append-system-prompt-file",
        "/workspace/coder-rules.md",
        "--dangerously-skip-permissions",
      ], (event) => logger.cliEvent("code_implementation", event));

      const parsed = coderResultSchema.parse(result.structured_output);
      logger.nodeEnd("code_implementation", `${parsed.filesChanged.length} file(s) changed`);

      return {
        coderResult: parsed,
        coderAttempts: state.coderAttempts + 1,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("code_implementation", "Failed", { attempt: state.coderAttempts + 1, error: message });
      return {
        coderAttempts: state.coderAttempts + 1,
        result: {
          errors: [
            {
              node: "coder",
              message,
              details: error instanceof ZodError ? error.issues : undefined,
            },
          ],
        },
      };
    }
  };
};
