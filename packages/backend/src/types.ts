export type TIssueComplexity = "low" | "medium" | "high";

export type TIssueIntake = {
  text: string;
  cleaned: string;
  title: string;
  requirements: string[];
  ambiguities: string[];
  complexity: TIssueComplexity;
};

export type TPipelineError = {
  node: string;
  message: string;
  details?: unknown;
};

export type TPipelineResult = {
  errors: TPipelineError[];
};

export type TIssuePlanRisk = {
  description: string;
  severity: "low" | "medium" | "high";
};

export type TIssuePlan = {
  approach: string;
  steps: string[];
  risks: TIssuePlanRisk[];
  estimatedScope: "trivial" | "small" | "medium" | "large";
  filesToModify: string[];
};

export type TCoderResult = {
  summary: string;
  filesChanged: string[];
};

export type TReviewFinding = {
  file: string;
  line: number;
  severity: "info" | "warning" | "error";
  category: "style" | "correctness" | "architecture" | "security";
  message: string;
};

export type TReviewResult = {
  approved: boolean;
  summary: string;
  findings: TReviewFinding[];
  testsPassed: boolean;
  testErrorSummary?: string;
};

export type TIntegratorResult = {
  branchName: string;
  prUrl: string;
  prNumber: number;
};

export type TNodeCost = {
  node: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
};

export type TIssueStatus = "open" | "claimed" | "success" | "failed";

export type TIssueRow = {
  id: number;
  title: string;
  body: string;
  status: TIssueStatus;
  claimed_at: string | null;
  finished_at: string | null;
  result_summary: string | null;
  pr_url: string | null;
  created_at: string;
  updated_at: string;
};

