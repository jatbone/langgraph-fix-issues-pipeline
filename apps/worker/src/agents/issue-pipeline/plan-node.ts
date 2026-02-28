/**
 * Plan node — runs Claude CLI in a Docker container to generate an
 * implementation plan based on the parsed issue and codebase context.
 */

import type { TIssuePipelineGraphState } from "@langgraph-fix-issues-pipeline/shared/server";
import type Docker from "dockerode";
import { z, ZodError } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { execInContainer } from "../../docker/index.js";

const PLANNER_CONTRACT = `You are a software architect — analyze the codebase before proposing changes.
Propose a single, clear implementation approach.
Identify concrete risks with severity levels.
Estimate scope realistically.
List exact file paths that need modification.
Do NOT make any changes to the codebase — read-only exploration only.
Respect existing architecture, patterns, and conventions.`;

const issuePlanSchema = z.object({
  approach: z.string().describe("High-level implementation approach"),
  steps: z.array(z.string()).describe("Ordered list of implementation steps"),
  risks: z.array(
    z.object({
      description: z.string().describe("Description of the risk"),
      severity: z.enum(["low", "medium", "high"]).describe("Risk severity"),
    }),
  ).describe("Identified risks"),
  estimatedScope: z
    .enum(["trivial", "small", "medium", "large"])
    .describe("Estimated scope of the change"),
  filesToModify: z
    .array(z.string())
    .describe("Exact file paths that need modification"),
});

const issuePlanJsonSchema = zodToJsonSchema(issuePlanSchema);

export const createPlanNode = (docker: Docker, containerId: string) => {
  return async (state: TIssuePipelineGraphState) => {
    const issue = state.issue!;

    const escapedContract = PLANNER_CONTRACT.replace(/'/g, "'\\''");
    await execInContainer(docker, containerId, [
      "sh",
      "-c",
      `echo '${escapedContract}' > /workspace/planner-rules.md`,
    ]);

    const prompt = [
      `Issue: ${issue.title}`,
      "",
      "Requirements:",
      ...issue.requirements.map((r) => `- ${r}`),
      "",
      "Ambiguities:",
      ...issue.ambiguities.map((a) => `- ${a}`),
      "",
      `Complexity: ${issue.complexity}`,
      "",
      "Analyze the codebase and generate an implementation plan.",
    ].join("\n");

    const cliOutput = await execInContainer(docker, containerId, [
      "claude",
      "-p",
      prompt,
      "--allowedTools",
      "Bash,Read,mcp",
      "--output-format",
      "json",
      "--json-schema",
      JSON.stringify(issuePlanJsonSchema),
      "--append-system-prompt-file",
      "/workspace/planner-rules.md",
      "--dangerously-skip-permissions",
    ]);

    console.log("Plan — Claude CLI raw output:", cliOutput);

    try {
      const cliJson = JSON.parse(cliOutput);
      const resultData = cliJson.structured_output;
      const parsed = issuePlanSchema.parse(resultData);

      return { plan: parsed };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("Plan — failed:", { rawOutput: cliOutput, error: message });
      return {
        result: {
          errors: [
            {
              node: "plan",
              message,
              details: error instanceof ZodError ? error.issues : undefined,
            },
          ],
        },
      };
    }
  };
};
