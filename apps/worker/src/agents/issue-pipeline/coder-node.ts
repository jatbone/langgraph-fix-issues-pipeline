/**
 * Coder node — runs Claude CLI in a Docker container to implement changes
 * based on the plan. Retries up to CODER_MAX_ATTEMPTS on test failures.
 */

import type { TIssuePipelineGraphState } from "@langgraph-fix-issues-pipeline/shared/server";
import type Docker from "dockerode";
import { z, ZodError } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { execInContainer } from "../../docker/index.js";
import { logger } from "./logger.js";

const CODER_CONTRACT = `Follow existing code conventions, patterns, and architecture.
Do not introduce unnecessary dependencies.
IMPORTANT: Do NOT auto-fix test failures — if tests fail, you MUST stop immediately and report the failures in structured output. Never attempt to fix failing tests on your own.
Run all tests after implementing changes.
Return structured output with testsPassed: false and testErrorSummary if tests fail.
Commit changes with a clear, descriptive commit message.`;

const coderResultSchema = z.object({
  summary: z.string().describe("Summary of changes made"),
  filesChanged: z
    .array(z.string())
    .describe("List of files that were modified"),
  testsPassed: z.boolean().describe("Whether all tests passed"),
  testErrorSummary: z
    .string()
    .optional()
    .describe("Summary of test errors if tests failed"),
});

const coderResultJsonSchema = zodToJsonSchema(coderResultSchema);

export const createCoderNode = (docker: Docker, containerId: string) => {
  return async (state: TIssuePipelineGraphState) => {
    const issue = state.issue!;
    const plan = state.plan!;

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
      "Implement all changes, run tests, and return the result.",
    ];

    if (state.coderAttempts > 0 && state.coderResult?.testErrorSummary) {
      promptParts.push(
        "",
        "PREVIOUS ATTEMPT FAILED — test errors from last run:",
        state.coderResult.testErrorSummary,
        "",
        "Fix these test failures and try again.",
      );
    }

    const prompt = promptParts.join("\n");

    const cliOutput = await execInContainer(docker, containerId, [
      "claude",
      "-p",
      prompt,
      "--allowedTools",
      "Bash,Read,Edit,Write,mcp",
      "--output-format",
      "json",
      "--json-schema",
      JSON.stringify(coderResultJsonSchema),
      "--append-system-prompt-file",
      "/workspace/coder-rules.md",
      "--dangerously-skip-permissions",
    ]);

    logger.log("code_implementation", "Claude CLI completed");

    try {
      const cliJson = JSON.parse(cliOutput);
      const resultData = cliJson.structured_output;
      const parsed = coderResultSchema.parse(resultData);

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
