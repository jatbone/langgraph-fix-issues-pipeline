import { describe, it, expect } from "vitest";
import {
  routeAfterFormatInput,
  routeAfterIssueIntake,
  routeAfterPlanGeneration,
  routeAfterCodeImplementation,
  routeAfterCodeReview,
} from "../routing.js";
import { ISSUE_NODES } from "../constants.js";
import { ISSUE_INTAKE_MAX_ATTEMPTS, REVIEW_MAX_ATTEMPTS } from "../constants.js";
import { createMockState } from "./helpers.js";

describe("routeAfterFormatInput", () => {
  it("routes to LOG_AND_NOTIFY when there are errors", () => {
    const state = createMockState({
      result: { errors: [{ node: "format_input", message: "fail" }] },
    });
    expect(routeAfterFormatInput(state)).toBe(ISSUE_NODES.LOG_AND_NOTIFY);
  });

  it("routes to ISSUE_INTAKE when there are no errors", () => {
    const state = createMockState();
    expect(routeAfterFormatInput(state)).toBe(ISSUE_NODES.ISSUE_INTAKE);
  });
});

describe("routeAfterIssueIntake", () => {
  it("routes to PLAN_GENERATION when title is present", () => {
    const state = createMockState({
      issue: {
        text: "raw",
        cleaned: "cleaned",
        title: "Fix bug",
        requirements: [],
        ambiguities: [],
        complexity: "low",
      },
    });
    expect(routeAfterIssueIntake(state)).toBe(ISSUE_NODES.PLAN_GENERATION);
  });

  it("retries ISSUE_INTAKE when no title and attempts remain", () => {
    const state = createMockState({ issueIntakeAttempts: 0 });
    expect(routeAfterIssueIntake(state)).toBe(ISSUE_NODES.ISSUE_INTAKE);
  });

  it("routes to LOG_AND_NOTIFY when no title and max attempts reached", () => {
    const state = createMockState({
      issueIntakeAttempts: ISSUE_INTAKE_MAX_ATTEMPTS,
    });
    expect(routeAfterIssueIntake(state)).toBe(ISSUE_NODES.LOG_AND_NOTIFY);
  });
});

describe("routeAfterPlanGeneration", () => {
  it("routes to LOG_AND_NOTIFY on errors", () => {
    const state = createMockState({
      result: { errors: [{ node: "plan_generation", message: "fail" }] },
    });
    expect(routeAfterPlanGeneration(state)).toBe(ISSUE_NODES.LOG_AND_NOTIFY);
  });

  it("routes to CODE_IMPLEMENTATION on success", () => {
    const state = createMockState();
    expect(routeAfterPlanGeneration(state)).toBe(ISSUE_NODES.CODE_IMPLEMENTATION);
  });
});

describe("routeAfterCodeImplementation", () => {
  it("routes to LOG_AND_NOTIFY on errors", () => {
    const state = createMockState({
      result: { errors: [{ node: "code_implementation", message: "fail" }] },
    });
    expect(routeAfterCodeImplementation(state)).toBe(ISSUE_NODES.LOG_AND_NOTIFY);
  });

  it("routes to CODE_REVIEW on success", () => {
    const state = createMockState();
    expect(routeAfterCodeImplementation(state)).toBe(ISSUE_NODES.CODE_REVIEW);
  });
});

describe("routeAfterCodeReview", () => {
  it("routes to LOG_AND_NOTIFY on errors", () => {
    const state = createMockState({
      result: { errors: [{ node: "code_review", message: "fail" }] },
    });
    expect(routeAfterCodeReview(state)).toBe(ISSUE_NODES.LOG_AND_NOTIFY);
  });

  it("routes to INTEGRATE when approved", () => {
    const state = createMockState({
      reviewResult: {
        approved: true,
        summary: "Looks good",
        findings: [],
        testsPassed: true,
      },
    });
    expect(routeAfterCodeReview(state)).toBe(ISSUE_NODES.INTEGRATE);
  });

  it("retries CODE_IMPLEMENTATION when rejected and attempts remain", () => {
    const state = createMockState({
      reviewResult: {
        approved: false,
        summary: "Needs work",
        findings: [],
        testsPassed: true,
      },
      reviewAttempts: 0,
    });
    expect(routeAfterCodeReview(state)).toBe(ISSUE_NODES.CODE_IMPLEMENTATION);
  });

  it("routes to LOG_AND_NOTIFY when rejected and max attempts reached", () => {
    const state = createMockState({
      reviewResult: {
        approved: false,
        summary: "Still bad",
        findings: [],
        testsPassed: false,
      },
      reviewAttempts: REVIEW_MAX_ATTEMPTS,
    });
    expect(routeAfterCodeReview(state)).toBe(ISSUE_NODES.LOG_AND_NOTIFY);
  });
});
