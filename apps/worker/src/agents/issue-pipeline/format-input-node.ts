/**
 * Format Input node — cleans and formats the raw issue text via LangChain on host.
 */

import { ChatAnthropic } from "@langchain/anthropic";
import type { TIssuePipelineGraphState } from "@langgraph-fix-issues-pipeline/shared/server";
import { z } from "zod";

const cleanedInputSchema = z.object({
  issueText: z.string(),
});

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
