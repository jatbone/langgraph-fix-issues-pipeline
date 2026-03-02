/**
 * Review node — runs Claude CLI in a Docker container to review the git diff
 * for style, correctness, architectural compliance, and security.
 * Can run tests but NOT modify any code.
 */

import type { TIssuePipelineGraphState, TNodeCost } from "@langgraph-fix-issues-pipeline/backend";
import type Docker from "dockerode";
import { z, ZodError } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { execInContainer, streamExecInContainer } from "../../docker/index.js";
import { REVIEWER_CONTRACT } from "./contracts.js";
import { extractNodeCost, logger } from "./logger.js";
import { DEFAULT_MODEL } from "./constants.js";

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
    logger.nodeStart("code_review");
    const costs: TNodeCost[] = [];
    try {
      if (!state.issue) {
        throw new Error("review requires state.issue");
      }
      if (!state.plan) {
        throw new Error("review requires state.plan");
      }
      if (!state.baseBranch) {
        throw new Error("review requires state.baseBranch");
      }

      const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

      const currentBranch = (await execInContainer(docker, containerId, [
        "git", "-C", "/workspace/repo", "branch", "--show-current",
      ])).trim();
      if (currentBranch !== state.baseBranch) {
        logger.log("code_review", `Branch mismatch: on "${currentBranch}", checking out "${state.baseBranch}"`);
        await execInContainer(docker, containerId, [
          "git", "-C", "/workspace/repo", "checkout", state.baseBranch,
        ]);
      }
      logger.log("code_review", `Branch verified: ${state.baseBranch}`);

      const issue = state.issue;
      const plan = state.plan;

      logger.log("code_review", "Installing dependencies…");
      await execInContainer(docker, containerId, [
        "sh",
        "-c",
        "cd /workspace/repo && " +
          "if [ -f pnpm-lock.yaml ]; then corepack enable && pnpm install --frozen-lockfile; " +
          "elif [ -f yarn.lock ]; then corepack enable && yarn install --frozen-lockfile; " +
          "else npm ci; fi",
      ]);
      logger.log("code_review", "Dependencies installed");

      const escapedContract = REVIEWER_CONTRACT.replace(/'/g, "'\\''");
      await execInContainer(docker, containerId, [
        "sh",
        "-c",
        `echo '${escapedContract}' > /workspace/reviewer-rules.md`,
      ]);

      const diffOutput = await execInContainer(docker, containerId, [
        "git", "-C", "/workspace/repo", "diff", "HEAD",
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
        "--model",
        model,
        "--disallowedTools",
        "Bash(git *)",
        "mcp__github*",
        "Edit",
        "Write",
        "NotebookEdit",
        "--output-format",
        "stream-json",
        "--verbose",
        "--json-schema",
        JSON.stringify(reviewResultJsonSchema),
        "--append-system-prompt-file",
        "/workspace/reviewer-rules.md",
        "--dangerously-skip-permissions",
      ], (event) => logger.cliEvent("code_review", event));

      const cost = extractNodeCost("code_review", result);
      if (cost) {
        costs.push(cost);
      }

      const parsed = reviewResultSchema.parse(result.structured_output);
      logger.log("code_review", "Result", parsed);
      const findings = parsed.findings.length;
      logger.nodeEnd("code_review", `${parsed.approved ? "approved" : "rejected"}${findings > 0 ? `, ${findings} finding(s)` : ""}`);

      return {
        reviewResult: parsed,
        reviewAttempts: state.reviewAttempts + 1,
        costs,
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
        costs,
      };
    }
  };
};
