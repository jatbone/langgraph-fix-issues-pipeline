/**
 * Format Input node — cleans and formats the raw issue text via LangChain on host.
 */

import { ChatAnthropic } from "@langchain/anthropic";
import type { TIssuePipelineGraphState } from "@langgraph-fix-issues-pipeline/shared/server";
import { z, ZodError } from "zod";
import { logger } from "./logger.js";

const cleanedInputSchema = z.object({
  issueText: z.string(),
});

export const createFormatInputNode = () => {
  return async (state: TIssuePipelineGraphState) => {
    logger.nodeStart("format_input");
    try {
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

      const parsed = cleanedInputSchema.parse(result);
      logger.log("format_input", "Result", parsed);

      logger.nodeEnd("format_input", `input cleaned: "${parsed.issueText}"`);

      return {
        issue: {
          text: state.inputText,
          cleaned: parsed.issueText,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn("format_input", "Validation failed", message);
      return {
        result: {
          errors: [
            {
              node: "format_input",
              message,
              details: error instanceof ZodError ? error.issues : undefined,
            },
          ],
        },
      };
    }
  };
};
