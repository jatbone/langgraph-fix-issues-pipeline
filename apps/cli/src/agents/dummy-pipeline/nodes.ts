/**
 * Node factory functions for the dummy pipeline.
 * Single node that sends input text to Claude and returns the response.
 */

import { ChatAnthropic } from "@langchain/anthropic";
import type { TDummyPipelineGraphState } from "@langgraph-fix-issues-pipeline/shared/server";

/**
 * Dummy node — sends the input text to Claude Haiku and returns the response.
 */
export const createDummyNode = () => {
  return async (state: TDummyPipelineGraphState) => {
    const model = new ChatAnthropic({
      model: "claude-haiku-4-5-20251001",
      temperature: 0,
    });

    const response = await model.invoke(state.inputText);

    return {
      outputText: typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content),
    };
  };
};
