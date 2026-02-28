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
