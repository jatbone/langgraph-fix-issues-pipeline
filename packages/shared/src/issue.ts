export type TIssueComplexity = "low" | "medium" | "high";

export type TIssueIntake = {
  title: string;
  requirements: string[];
  ambiguities: string[];
  complexity: TIssueComplexity;
};
