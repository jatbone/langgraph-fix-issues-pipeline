/**
 * Server-only exports — LangGraph Annotation.Root state definitions.
 * These depend on @langchain/langgraph which is a server-side dependency.
 * Import via "@langgraph-fix-issues-pipeline/shared/server".
 */

import { Annotation } from "@langchain/langgraph";

/**
 * Dummy Pipeline graph state.
 * Simple input/output text state for the single-node pipeline.
 */
export const DummyPipelineState = Annotation.Root({
  /** Input text to send to the LLM */
  inputText: Annotation<string>({
    reducer: (x, y) => y ?? x ?? "",
    default: () => "",
  }),
  /** Output text returned by the LLM */
  outputText: Annotation<string>({
    reducer: (x, y) => y ?? x ?? "",
    default: () => "",
  }),
  /** Docker container ID persisted across pipeline nodes */
  containerId: Annotation<string>({
    reducer: (x, y) => y ?? x ?? "",
    default: () => "",
  }),
});

export type TDummyPipelineGraphState = typeof DummyPipelineState.State;
