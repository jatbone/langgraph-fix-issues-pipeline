/**
 * Integrator node — creates a branch, commits, pushes, and opens a PR
 * via Claude CLI running inside the Docker container. Does NOT modify any code.
 */

import type { TIssuePipelineGraphState, TNodeCost } from "@langgraph-fix-issues-pipeline/backend";
import type Docker from "dockerode";
import { z, ZodError } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { execInContainer, streamExecInContainer } from "../../docker/index.js";
import { INTEGRATOR_CONTRACT } from "./contracts.js";
import { extractNodeCost, logger } from "./logger.js";
import { slugify } from "./utils.js";
import { DEFAULT_FAST_MODEL } from "./constants.js";

const PR_DESCRIPTION_TEMPLATE = `## Summary
{{summary}}

## Changes
{{filesList}}

## Approach
{{approach}}

## Review
{{reviewSummary}}`;

const integratorResultSchema = z.object({
  prUrl: z.string().describe("Full URL of the created pull request"),
  prNumber: z.number().describe("Pull request number"),
});

const integratorResultJsonSchema = zodToJsonSchema(integratorResultSchema);

export const createIntegratorNode = (docker: Docker, containerId: string) => {
  return async (state: TIssuePipelineGraphState) => {
    logger.nodeStart("integrate");
    const costs: TNodeCost[] = [];
    try {
      if (!state.issue) {
        throw new Error("integrator requires state.issue");
      }
      if (!state.plan) {
        throw new Error("integrator requires state.plan");
      }
      if (!state.coderResult) {
        throw new Error("integrator requires state.coderResult");
      }
      if (!state.baseBranch) {
        throw new Error("integrator requires state.baseBranch");
      }

      const currentBranch = (await execInContainer(docker, containerId, [
        "git", "-C", "/workspace/repo", "branch", "--show-current",
      ])).trim();
      if (currentBranch !== state.baseBranch) {
        logger.log("integrate", `Branch mismatch: on "${currentBranch}", checking out "${state.baseBranch}"`);
        await execInContainer(docker, containerId, [
          "git", "-C", "/workspace/repo", "checkout", state.baseBranch,
        ]);
      }
      logger.log("integrate", `Branch verified: ${state.baseBranch}`);

      await execInContainer(docker, containerId, [
        "git", "-C", "/workspace/repo", "config", "user.email", "agent@company.com",
      ]);
      await execInContainer(docker, containerId, [
        "git", "-C", "/workspace/repo", "config", "user.name", "Fix Issue Agent",
      ]);

      const fastModel = process.env.ANTHROPIC_FAST_MODEL || DEFAULT_FAST_MODEL;

      const slug = slugify(state.issue.title);
      const branchName = `fix/${slug}`;
      const commitMessage = `fix: ${state.issue.title}`;

      const escapedContract = INTEGRATOR_CONTRACT.replace(/'/g, "'\\''");
      await execInContainer(docker, containerId, [
        "sh",
        "-c",
        `echo '${escapedContract}' > /workspace/integrator-rules.md`,
      ]);

      const prBody = PR_DESCRIPTION_TEMPLATE
        .replace("{{summary}}", state.coderResult.summary)
        .replace("{{filesList}}", state.coderResult.filesChanged.map((f) => `- ${f}`).join("\n"))
        .replace("{{approach}}", state.plan.approach)
        .replace("{{reviewSummary}}", state.reviewResult?.summary ?? "N/A");

      const escapedPrBody = prBody.replace(/'/g, "'\\''");
      await execInContainer(docker, containerId, [
        "sh",
        "-c",
        `echo '${escapedPrBody}' > /workspace/pr-description.md`,
      ]);

      const promptParts = [
        `Create a branch, commit all changes, push, and open a pull request.`,
        "",
        `Branch to create: ${branchName}`,
        `Commit message: ${commitMessage}`,
        `Base branch (PR target): ${state.baseBranch}`,
        "",
        `PR title: ${commitMessage}`,
        "",
        "The PR body is provided in /workspace/pr-description.md — read it and use it as the PR body.",
        "",
        "Files changed by the coder:",
        ...state.coderResult.filesChanged.map((f) => `- ${f}`),
        "",
        "If any of the provided parameters are missing, empty, or seem incorrect, generate sensible values yourself based on the repository context and the changes made.",
      ];

      const prompt = promptParts.join("\n");

      const result = await streamExecInContainer(docker, containerId, [
        "claude",
        "-p",
        prompt,
        "--model",
        fastModel,
        "--output-format",
        "stream-json",
        "--verbose",
        "--json-schema",
        JSON.stringify(integratorResultJsonSchema),
        "--append-system-prompt-file",
        "/workspace/integrator-rules.md",
        "--dangerously-skip-permissions",
      ], (event) => logger.cliEvent("integrate", event));

      const cost = extractNodeCost("integrate", result);
      if (cost) {
        costs.push(cost);
      }

      const parsed = integratorResultSchema.parse(result.structured_output);
      logger.log("integrate", "Result", parsed);
      logger.nodeEnd("integrate", `PR #${parsed.prNumber} created`);

      return {
        integratorResult: {
          branchName,
          prUrl: parsed.prUrl,
          prNumber: parsed.prNumber,
        },
        costs,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("integrate", "Failed", { error: message });
      return {
        result: {
          errors: [
            {
              node: "integrate",
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
