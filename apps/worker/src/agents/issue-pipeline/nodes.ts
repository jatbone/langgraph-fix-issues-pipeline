/**
 * Node factory functions for the issue pipeline.
 */

import { ChatAnthropic } from "@langchain/anthropic";
import type { TIssuePipelineGraphState } from "@langgraph-fix-issues-pipeline/shared/server";
import type Docker from "dockerode";
import { z, ZodError } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { execInContainer } from "../../docker/index.js";

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

const cleanedInputSchema = z.object({
  issueText: z.string(),
});

/**
 * Format Input node — cleans and formats the raw issue text via LangChain on host.
 */
export const createFormatInputNode = () => {
  return async (state: TIssuePipelineGraphState) => {
    const model = new ChatAnthropic({
      model: "claude-haiku-4-5-20251001",
      temperature: 0,
    });

    const structuredModel = model.withStructuredOutput(cleanedInputSchema);

    const result = await structuredModel.invoke([
      {
        role: "system",
        content:
          "You are an input formatter. Given a raw issue description, clean it up into a well-structured issue description. PRESERVE all original meaning and details. DO NOT analyze, classify, or add information — ONLY clean and format.",
      },
      {
        role: "user",
        content: state.inputText,
      },
    ]);

    console.log("Format Input — Cleaned input:", result);

    return {
      issue: {
        text: state.inputText,
        cleaned: result.issueText,
      },
    };
  };
};

/**
 * Issue Intake node — runs Claude CLI in a Docker container to analyze the issue
 * with codebase context. On ZodError, stores error in state for conditional retry.
 */
export const createIssueIntakeNode = (docker: Docker, containerId: string) => {
  return async (state: TIssuePipelineGraphState) => {
    const cleanedText = state.issue!.cleaned;

    const prompt = [
      "Here is an issue to analyze in the context of this codebase:",
      "",
      cleanedText,
      "",
      "Parse this issue, extract requirements, identify ambiguities, and classify complexity.",
    ].join("\n");

    const cliOutput = await execInContainer(docker, containerId, [
      "claude",
      "-p",
      prompt,
      "--allowedTools",
      "Bash,Read,Edit,Write,mcp",
      "--output-format",
      "json",
      "--json-schema",
      JSON.stringify(issueIntakeJsonSchema),
      "--dangerously-skip-permissions",
    ]);

    console.log("Issue Intake — Claude CLI raw output:", cliOutput);

    try {
      const cliJson = JSON.parse(cliOutput);
      const resultData = cliJson.structured_output;
      const parsed = issueIntakeSchema.parse(resultData);

      return {
        issue: { ...state.issue, ...parsed },
        issueIntakeAttempts: state.issueIntakeAttempts + 1,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `Issue Intake — failed (attempt ${state.issueIntakeAttempts + 1}):`,
        { rawOutput: cliOutput, error: message },
      );
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
