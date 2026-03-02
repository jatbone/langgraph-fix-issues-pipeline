/**
 * Coder node — runs Claude CLI in a Docker container to implement changes
 * based on the plan. Does not run tests — testing is handled by the review node.
 */

import type { TIssuePipelineGraphState } from "@langgraph-fix-issues-pipeline/backend";
import type Docker from "dockerode";
import { z, ZodError } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { execInContainer, streamExecInContainer } from "../../docker/index.js";
import { CODER_CONTRACT } from "./contracts.js";
import { logger } from "./logger.js";
import { DEFAULT_MODEL } from "./constants.js";

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
      if (!state.baseBranch) {
        throw new Error("coder requires state.baseBranch");
      }

      const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

      const issue = state.issue;
      const plan = state.plan;

      const currentBranch = (
        await execInContainer(docker, containerId, [
          "git",
          "-C",
          "/workspace/repo",
          "branch",
          "--show-current",
        ])
      ).trim();
      if (currentBranch !== state.baseBranch) {
        logger.log(
          "code_implementation",
          `Branch mismatch: on "${currentBranch}", checking out "${state.baseBranch}"`,
        );
        await execInContainer(docker, containerId, [
          "git",
          "-C",
          "/workspace/repo",
          "checkout",
          state.baseBranch,
        ]);
      }
      logger.log("code_implementation", `Branch verified: ${state.baseBranch}`);

      logger.log("code_implementation", "Installing dependencies…");
      await execInContainer(docker, containerId, [
        "sh",
        "-c",
        "cd /workspace/repo && " +
          "if [ -f pnpm-lock.yaml ]; then corepack enable && pnpm install --frozen-lockfile; " +
          "elif [ -f yarn.lock ]; then corepack enable && yarn install --frozen-lockfile; " +
          "else npm ci; fi",
      ]);
      logger.log("code_implementation", "Dependencies installed");

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
            .map(
              (f) =>
                `- [${f.severity}] ${f.file}:${f.line} (${f.category}): ${f.message}`,
            ),
          "",
          "Fix all error-severity findings and address warnings where possible.",
        );
        if (
          !state.reviewResult.testsPassed &&
          state.reviewResult.testErrorSummary
        ) {
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

      const result = await streamExecInContainer(
        docker,
        containerId,
        [
          "claude",
          "-p",
          prompt,
          "--model",
          model,
          "--disallowedTools",
          "Bash(git *)",
          "mcp__github*",
          "--output-format",
          "stream-json",
          "--verbose",
          "--json-schema",
          JSON.stringify(coderResultJsonSchema),
          "--append-system-prompt-file",
          "/workspace/coder-rules.md",
          "--dangerously-skip-permissions",
        ],
        (event) => logger.cliEvent("code_implementation", event),
      );

      const parsed = coderResultSchema.parse(result.structured_output);
      logger.log("code_implementation", "Result", parsed);
      logger.nodeEnd(
        "code_implementation",
        `${parsed.filesChanged.length} file(s) changed`,
      );

      return {
        coderResult: parsed,
        coderAttempts: state.coderAttempts + 1,
        result: { errors: [] },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("code_implementation", "Failed", {
        attempt: state.coderAttempts + 1,
        error: message,
      });
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
