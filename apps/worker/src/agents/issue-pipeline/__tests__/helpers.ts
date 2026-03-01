import type { TIssuePipelineGraphState } from "@langgraph-fix-issues-pipeline/backend";

export const createMockState = (
  overrides: Partial<TIssuePipelineGraphState> = {},
): TIssuePipelineGraphState => ({
  inputText: "",
  baseBranch: "devel",
  issueId: null,
  issue: null,
  result: { errors: [] },
  issueIntakeAttempts: 0,
  plan: null,
  coderResult: null,
  coderAttempts: 0,
  reviewResult: null,
  reviewAttempts: 0,
  integratorResult: null,
  ...overrides,
});
