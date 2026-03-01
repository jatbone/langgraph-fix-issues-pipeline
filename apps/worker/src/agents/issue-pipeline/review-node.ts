/**
 * Review node — runs Claude CLI in a Docker container to review the git diff
 * for style, correctness, architectural compliance, and security.
 * Can run tests but NOT modify any code.
 */

import type { TIssuePipelineGraphState } from "@langgraph-fix-issues-pipeline/shared/server";
import type Docker from "dockerode";
import { z, ZodError } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { execInContainer, streamExecInContainer } from "../../docker/index.js";
import { logger } from "./logger.js";

const REVIEWER_CONTRACT = `You are a senior code reviewer. Your job is to review a git diff and run the test suite.
Do NOT modify any code — you are read-only.

Review the diff for:
1. **Style** — naming conventions, formatting, consistency with existing code
2. **Correctness** — logic errors, edge cases, off-by-one errors, null handling
3. **Architecture** — does the change respect existing patterns and separation of concerns?
4. **Security** — injection vulnerabilities, secrets exposure, unsafe input handling

After reviewing the diff, run the full test suite.

For each finding, report:
- The exact file path
- The line number in the diff
- Severity: "info", "warning", or "error"
- Category: "style", "correctness", "architecture", or "security"
- A clear, actionable message

Set approved to true ONLY if there are no "error" severity findings AND all tests pass.
If tests fail, set testsPassed to false and include the error summary in testErrorSummary.`;

const reviewResultSchema = z.object({
  approved: z.boolean().describe("Whether the changes are approved"),
  summary: z.string().describe("Overall review summary"),
  findings: z.array(
    z.object({
      file: z.string().describe("File path"),
      line: z.number().describe("Line number in the diff"),
      severity: z.enum(["info", "warning", "error"]).describe("Finding severity"),
      category: z.enum(["style", "correctness", "architecture", "security"]).describe("Finding category"),
      message: z.string().describe("Actionable message"),
    }),
  ).describe("List of review findings"),
  testsPassed: z.boolean().describe("Whether all tests passed"),
  testErrorSummary: z
    .string()
    .optional()
    .describe("Summary of test errors if tests failed"),
});

const reviewResultJsonSchema = zodToJsonSchema(reviewResultSchema);

export const createReviewNode = (docker: Docker, containerId: string) => {
  return async (state: TIssuePipelineGraphState) => {
    try {
      if (!state.issue) {
        throw new Error("review requires state.issue");
      }
      if (!state.plan) {
        throw new Error("review requires state.plan");
      }

      const issue = state.issue;
      const plan = state.plan;

      const escapedContract = REVIEWER_CONTRACT.replace(/'/g, "'\\''");
      await execInContainer(docker, containerId, [
        "sh",
        "-c",
        `echo '${escapedContract}' > /workspace/reviewer-rules.md`,
      ]);

      const diffOutput = await execInContainer(docker, containerId, [
        "git",
        "-C",
        "/workspace/repo",
        "diff",
        "HEAD~1",
      ]);

      const promptParts = [
        `Issue: ${issue.title}`,
        "",
        "Requirements:",
        ...issue.requirements.map((r) => `- ${r}`),
        "",
        `Plan approach: ${plan.approach}`,
        "",
        "Git diff to review:",
        "```",
        diffOutput,
        "```",
        "",
        "Review the diff for style, correctness, architecture, and security issues. Then run the test suite.",
      ];

      const prompt = promptParts.join("\n");

      const result = await streamExecInContainer(docker, containerId, [
        "claude",
        "-p",
        prompt,
        "--allowedTools",
        "Bash,Read,mcp",
        "--output-format",
        "stream-json",
        "--verbose",
        "--json-schema",
        JSON.stringify(reviewResultJsonSchema),
        "--append-system-prompt-file",
        "/workspace/reviewer-rules.md",
        "--dangerously-skip-permissions",
      ], (event) => logger.cliEvent("code_review", event));

      const parsed = reviewResultSchema.parse(result.structured_output);

      return {
        reviewResult: parsed,
        reviewAttempts: state.reviewAttempts + 1,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("code_review", "Failed", { attempt: state.reviewAttempts + 1, error: message });
      return {
        reviewAttempts: state.reviewAttempts + 1,
        result: {
          errors: [
            {
              node: "code_review",
              message,
              details: error instanceof ZodError ? error.issues : undefined,
            },
          ],
        },
      };
    }
  };
};
