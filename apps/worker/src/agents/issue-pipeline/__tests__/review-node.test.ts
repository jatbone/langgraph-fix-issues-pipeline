import { describe, it, expect, vi, beforeEach } from "vitest";

const mockExec = vi.fn();
const mockStreamExec = vi.fn();

vi.mock("../../../docker/index.js", () => ({
  execInContainer: (...args: unknown[]) => mockExec(...args),
  streamExecInContainer: (...args: unknown[]) => mockStreamExec(...args),
}));

vi.mock("../logger.js", () => ({
  extractNodeCost: vi.fn().mockReturnValue(null),
  logger: {
    nodeStart: vi.fn(),
    nodeEnd: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
    cliEvent: vi.fn(),
  },
}));

import { extractNodeCost } from "../logger.js";
import { createReviewNode } from "../review-node.js";
import { createMockState, MOCK_ISSUE, MOCK_PLAN } from "./helpers.js";
import type Docker from "dockerode";

const mockExtractNodeCost = vi.mocked(extractNodeCost);

const docker = {} as Docker;
const containerId = "test-container";

const approvedOutput = {
  approved: true,
  summary: "All good",
  findings: [],
  testsPassed: true,
};

const rejectedOutput = {
  approved: false,
  summary: "Issues found",
  findings: [
    {
      file: "src/auth.ts",
      line: 5,
      severity: "error",
      category: "correctness",
      message: "Null pointer",
    },
  ],
  testsPassed: false,
  testErrorSummary: "1 test failed",
};

describe("createReviewNode", () => {
  beforeEach(() => {
    mockExec.mockReset();
    mockStreamExec.mockReset();
    mockExtractNodeCost.mockReset().mockReturnValue(null);
    // Default: branch matches, exec calls succeed, diff returns something
    mockExec.mockResolvedValue("devel");
  });

  it("returns error when state.issue is null", async () => {
    const node = createReviewNode(docker, containerId);
    const state = createMockState({ issue: null, plan: MOCK_PLAN });
    const result = await node(state);

    expect(result.result?.errors[0].message).toBe("review requires state.issue");
  });

  it("returns error when state.plan is null", async () => {
    const node = createReviewNode(docker, containerId);
    const state = createMockState({ issue: MOCK_ISSUE, plan: null });
    const result = await node(state);

    expect(result.result?.errors[0].message).toBe("review requires state.plan");
  });

  it("returns error when state.baseBranch is empty", async () => {
    const node = createReviewNode(docker, containerId);
    const state = createMockState({
      issue: MOCK_ISSUE,
      plan: MOCK_PLAN,
      baseBranch: "",
    });
    const result = await node(state);

    expect(result.result?.errors[0].message).toBe("review requires state.baseBranch");
  });

  it("checks out baseBranch when current branch mismatches", async () => {
    mockExec
      .mockResolvedValueOnce("wrong-branch") // branch --show-current
      .mockResolvedValue(""); // remaining calls
    mockStreamExec.mockResolvedValue({
      type: "result",
      structured_output: approvedOutput,
    });

    const node = createReviewNode(docker, containerId);
    const state = createMockState({ issue: MOCK_ISSUE, plan: MOCK_PLAN });
    await node(state);

    const checkoutCall = mockExec.mock.calls[1];
    const cmd = checkoutCall[2] as string[];
    expect(cmd).toContain("checkout");
    expect(cmd).toContain("devel");
  });

  it("gets git diff and includes it in the CLI prompt", async () => {
    mockExec.mockImplementation((_d: unknown, _c: unknown, cmd: string[]) => {
      if (cmd.includes("diff")) {
        return Promise.resolve("+ added line\n- removed line");
      }
      return Promise.resolve("devel");
    });
    mockStreamExec.mockResolvedValue({
      type: "result",
      structured_output: approvedOutput,
    });

    const node = createReviewNode(docker, containerId);
    const state = createMockState({ issue: MOCK_ISSUE, plan: MOCK_PLAN });
    await node(state);

    const cliArgs = mockStreamExec.mock.calls[0][2] as string[];
    expect(cliArgs).toContain("--model");
    expect(cliArgs[cliArgs.indexOf("--model") + 1]).toBe("sonnet");
    const promptIdx = cliArgs.indexOf("-p");
    const prompt = cliArgs[promptIdx + 1];
    expect(prompt).toContain("+ added line");
    expect(prompt).toContain("- removed line");
    const disallowedIdx = cliArgs.indexOf("--disallowedTools");
    const disallowed = cliArgs.slice(disallowedIdx + 1, cliArgs.indexOf("--output-format"));
    expect(disallowed).toContain("Edit");
    expect(disallowed).toContain("Write");
    expect(disallowed).toContain("NotebookEdit");
  });

  it("returns approved reviewResult and increments attempts on success", async () => {
    mockStreamExec.mockResolvedValue({
      type: "result",
      structured_output: approvedOutput,
    });

    const node = createReviewNode(docker, containerId);
    const state = createMockState({
      issue: MOCK_ISSUE,
      plan: MOCK_PLAN,
      reviewAttempts: 0,
    });
    const result = await node(state);

    expect(result.reviewResult).toEqual(approvedOutput);
    expect(result.reviewAttempts).toBe(1);
  });

  it("returns rejected reviewResult with findings", async () => {
    mockStreamExec.mockResolvedValue({
      type: "result",
      structured_output: rejectedOutput,
    });

    const node = createReviewNode(docker, containerId);
    const state = createMockState({
      issue: MOCK_ISSUE,
      plan: MOCK_PLAN,
      reviewAttempts: 0,
    });
    const result = await node(state);

    expect(result.reviewResult?.approved).toBe(false);
    expect(result.reviewResult?.findings).toHaveLength(1);
    expect(result.reviewResult?.testsPassed).toBe(false);
    expect(result.reviewResult?.testErrorSummary).toBe("1 test failed");
    expect(result.reviewAttempts).toBe(1);
  });

  it("writes reviewer contract file before calling CLI", async () => {
    mockStreamExec.mockResolvedValue({
      type: "result",
      structured_output: approvedOutput,
    });

    const node = createReviewNode(docker, containerId);
    const state = createMockState({ issue: MOCK_ISSUE, plan: MOCK_PLAN });
    await node(state);

    const contractCall = mockExec.mock.calls.find(
      (call) => (call[2] as string[]).join(" ").includes("reviewer-rules.md"),
    );
    expect(contractCall).toBeDefined();
  });

  it("returns error and increments attempts when CLI throws", async () => {
    mockStreamExec.mockRejectedValue(new Error("Timeout"));

    const node = createReviewNode(docker, containerId);
    const state = createMockState({
      issue: MOCK_ISSUE,
      plan: MOCK_PLAN,
      reviewAttempts: 1,
    });
    const result = await node(state);

    expect(result.reviewAttempts).toBe(2);
    expect(result.result).toEqual({
      errors: [{ node: "code_review", message: "Timeout", details: undefined }],
    });
  });

  it("returns error with Zod details when structured_output is invalid", async () => {
    mockStreamExec.mockResolvedValue({
      type: "result",
      structured_output: { approved: "not-a-boolean" },
    });

    const node = createReviewNode(docker, containerId);
    const state = createMockState({
      issue: MOCK_ISSUE,
      plan: MOCK_PLAN,
      reviewAttempts: 0,
    });
    const result = await node(state);

    expect(result.reviewAttempts).toBe(1);
    expect(result.result?.errors).toHaveLength(1);
    expect(result.result?.errors[0].node).toBe("code_review");
    expect(result.result?.errors[0].details).toBeDefined();
    expect(Array.isArray(result.result?.errors[0].details)).toBe(true);
  });

  it("returns costs on success when extractNodeCost returns a value", async () => {
    const mockCost = { node: "code_review", costUsd: 0.25, inputTokens: 3000, outputTokens: 1500 };
    mockExtractNodeCost.mockReturnValue(mockCost);
    mockStreamExec.mockResolvedValue({
      type: "result",
      structured_output: approvedOutput,
    });

    const node = createReviewNode(docker, containerId);
    const state = createMockState({ issue: MOCK_ISSUE, plan: MOCK_PLAN });
    const result = await node(state);

    expect(result.costs).toEqual([mockCost]);
  });

  it("returns empty costs when extractNodeCost returns null", async () => {
    mockStreamExec.mockResolvedValue({
      type: "result",
      structured_output: approvedOutput,
    });

    const node = createReviewNode(docker, containerId);
    const state = createMockState({ issue: MOCK_ISSUE, plan: MOCK_PLAN });
    const result = await node(state);

    expect(result.costs).toEqual([]);
  });

  it("returns costs on Zod error when CLI succeeded", async () => {
    const mockCost = { node: "code_review", costUsd: 0.20, inputTokens: 2500, outputTokens: 800 };
    mockExtractNodeCost.mockReturnValue(mockCost);
    mockStreamExec.mockResolvedValue({
      type: "result",
      structured_output: { approved: "not-a-boolean" },
    });

    const node = createReviewNode(docker, containerId);
    const state = createMockState({ issue: MOCK_ISSUE, plan: MOCK_PLAN });
    const result = await node(state);

    expect(result.result?.errors).toHaveLength(1);
    expect(result.costs).toEqual([mockCost]);
  });

  it("returns empty costs when CLI throws", async () => {
    mockStreamExec.mockRejectedValue(new Error("Timeout"));

    const node = createReviewNode(docker, containerId);
    const state = createMockState({ issue: MOCK_ISSUE, plan: MOCK_PLAN });
    const result = await node(state);

    expect(result.costs).toEqual([]);
  });
});
