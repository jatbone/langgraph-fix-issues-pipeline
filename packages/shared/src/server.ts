/**
 * Server-only exports — LangGraph Annotation.Root state definitions.
 * These depend on @langchain/langgraph which is a server-side dependency.
 * Import via "@langgraph-fix-issues-pipeline/shared/server".
 */

import { Annotation } from "@langchain/langgraph";
import type { TIssueIntake } from "./issue.js";
export type { TIssueIntake } from "./issue.js";

/**
 * Issue Pipeline graph state.
 */
export const IssuePipelineState = Annotation.Root({
  /** Raw issue input text */
  inputText: Annotation<string>({
    reducer: (x, y) => y ?? x ?? "",
    default: () => "",
  }),
  /** Structured issue intake result */
  issue: Annotation<TIssueIntake | null>({
    reducer: (x, y) => y ?? x ?? null,
    default: () => null,
  }),
  /** Docker container ID persisted across pipeline nodes */
  containerId: Annotation<string>({
    reducer: (x, y) => y ?? x ?? "",
    default: () => "",
  }),
  /** Number of container creation retries attempted */
  containerCreateRetries: Annotation<number>({
    reducer: (x, y) => y ?? x ?? 0,
    default: () => 0,
  }),
});

export type TIssuePipelineGraphState = typeof IssuePipelineState.State;
