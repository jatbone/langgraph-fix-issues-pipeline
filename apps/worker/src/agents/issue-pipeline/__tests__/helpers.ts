import type {
  TIssuePipelineGraphState,
  TIssueIntake,
  TIssuePlan,
  TCoderResult,
  TReviewResult,
} from "@langgraph-fix-issues-pipeline/backend";

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

export const MOCK_ISSUE: TIssueIntake = {
  text: "raw issue text",
  cleaned: "cleaned issue text",
  title: "Fix login bug",
  requirements: ["Fix the login button", "Add error handling"],
  ambiguities: ["Unclear which login page"],
  complexity: "medium",
};

export const MOCK_PLAN: TIssuePlan = {
  approach: "Fix the auth module",
  steps: ["Update auth.ts", "Add tests"],
  risks: [{ description: "May break SSO", severity: "low" }],
  estimatedScope: "small",
  filesToModify: ["src/auth.ts", "src/auth.test.ts"],
};

export const MOCK_CODER_RESULT: TCoderResult = {
  summary: "Fixed login bug in auth module",
  filesChanged: ["src/auth.ts", "src/auth.test.ts"],
};

export const MOCK_REVIEW_APPROVED: TReviewResult = {
  approved: true,
  summary: "Looks good",
  findings: [],
  testsPassed: true,
};

export const MOCK_REVIEW_REJECTED: TReviewResult = {
  approved: false,
  summary: "Needs work",
  findings: [
    {
      file: "src/auth.ts",
      line: 10,
      severity: "error",
      category: "correctness",
      message: "Missing null check",
    },
  ],
  testsPassed: false,
  testErrorSummary: "auth.test.ts: expected true, got false",
};
