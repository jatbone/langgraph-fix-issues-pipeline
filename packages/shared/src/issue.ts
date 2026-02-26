export type TIssueComplexity = "low" | "medium" | "high";

export type TIssueIntake = {
  inputText: string;
  title: string;
  requirements: string[];
  ambiguities: string[];
  complexity: TIssueComplexity;
};
