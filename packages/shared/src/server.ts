/**
 * Server-only exports — LangGraph Annotation.Root state definitions.
 * These depend on @langchain/langgraph which is a server-side dependency.
 * Import via "@langgraph-fix-issues-pipeline/shared/server".
 */

import { Annotation } from "@langchain/langgraph";
import type { TIssueIntake, TPipelineResult } from "./issue.js";
export type { TIssueIntake, TPipelineResult } from "./issue.js";

/**
 * Issue Pipeline graph state.
 */
export const IssuePipelineState = Annotation.Root({
  /** Raw issue text */
  inputText: Annotation<string>({
    reducer: (x, y) => y ?? x ?? "",
    default: () => "",
  }),
  /** Structured issue intake result */
  issue: Annotation<TIssueIntake | null>({
    reducer: (x, y) => y ?? x ?? null,
    default: () => null,
  }),
  /** Pipeline result with collected errors */
  result: Annotation<TPipelineResult>({
    reducer: (x, y) => y ?? x ?? { errors: [] },
    default: () => ({ errors: [] }),
  }),
  /** Number of issue intake attempts (for conditional retry) */
  issueIntakeAttempts: Annotation<number>({
    reducer: (x, y) => y ?? x ?? 0,
    default: () => 0,
  }),
});

export type TIssuePipelineGraphState = typeof IssuePipelineState.State;
