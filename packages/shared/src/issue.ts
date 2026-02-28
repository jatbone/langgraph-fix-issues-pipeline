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
  testsPassed: boolean;
  testErrorSummary?: string;
};
