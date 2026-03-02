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
import { createCoderNode } from "../coder-node.js";
import {
  createMockState,
  MOCK_ISSUE,
  MOCK_PLAN,
  MOCK_REVIEW_REJECTED,
} from "./helpers.js";
import type Docker from "dockerode";

const mockExtractNodeCost = vi.mocked(extractNodeCost);

const docker = {} as Docker;
const containerId = "test-container";

const validCoderOutput = {
  summary: "Fixed the bug",
  filesChanged: ["src/auth.ts"],
};

describe("createCoderNode", () => {
  beforeEach(() => {
    mockExec.mockReset();
    mockStreamExec.mockReset();
    mockExtractNodeCost.mockReset().mockReturnValue(null);
    // Default: branch matches, exec calls succeed
    mockExec.mockResolvedValue("devel");
  });

  it("returns error when state.issue is null", async () => {
    const node = createCoderNode(docker, containerId);
    const state = createMockState({ issue: null, plan: MOCK_PLAN });
    const result = await node(state);

    expect(result.result?.errors[0].message).toBe("coder requires state.issue");
  });

  it("returns error when state.plan is null", async () => {
    const node = createCoderNode(docker, containerId);
    const state = createMockState({ issue: MOCK_ISSUE, plan: null });
    const result = await node(state);

    expect(result.result?.errors[0].message).toBe("coder requires state.plan");
  });

  it("returns error when state.baseBranch is empty", async () => {
    const node = createCoderNode(docker, containerId);
    const state = createMockState({
      issue: MOCK_ISSUE,
      plan: MOCK_PLAN,
      baseBranch: "",
    });
    const result = await node(state);

    expect(result.result?.errors[0].message).toBe("coder requires state.baseBranch");
  });

  it("checks out baseBranch when current branch mismatches", async () => {
    mockExec
      .mockResolvedValueOnce("wrong-branch") // branch --show-current
      .mockResolvedValue(""); // remaining calls
    mockStreamExec.mockResolvedValue({
      type: "result",
      structured_output: validCoderOutput,
    });

    const node = createCoderNode(docker, containerId);
    const state = createMockState({ issue: MOCK_ISSUE, plan: MOCK_PLAN });
    await node(state);

    // Second exec call should be git checkout
    const checkoutCall = mockExec.mock.calls[1];
    const cmd = checkoutCall[2] as string[];
    expect(cmd).toContain("checkout");
    expect(cmd).toContain("devel");
  });

  it("skips checkout when branch matches", async () => {
    mockExec.mockResolvedValue("devel");
    mockStreamExec.mockResolvedValue({
      type: "result",
      structured_output: validCoderOutput,
    });

    const node = createCoderNode(docker, containerId);
    const state = createMockState({ issue: MOCK_ISSUE, plan: MOCK_PLAN });
    await node(state);

    // Should NOT have a checkout call — calls should be:
    // 1. branch --show-current, 2. install deps, 3. write contract
    const checkoutCalls = mockExec.mock.calls.filter(
      (call) => (call[2] as string[]).includes("checkout"),
    );
    expect(checkoutCalls).toHaveLength(0);
  });

  it("installs dependencies before running CLI", async () => {
    mockExec.mockResolvedValue("devel");
    mockStreamExec.mockResolvedValue({
      type: "result",
      structured_output: validCoderOutput,
    });

    const node = createCoderNode(docker, containerId);
    const state = createMockState({ issue: MOCK_ISSUE, plan: MOCK_PLAN });
    await node(state);

    // Find the install deps call (sh -c with pnpm/yarn/npm)
    const installCall = mockExec.mock.calls.find(
      (call) => (call[2] as string[]).join(" ").includes("pnpm install"),
    );
    expect(installCall).toBeDefined();
  });

  it("returns coderResult and increments attempts on success", async () => {
    mockExec.mockResolvedValue("devel");
    mockStreamExec.mockResolvedValue({
      type: "result",
      structured_output: validCoderOutput,
    });

    const node = createCoderNode(docker, containerId);
    const state = createMockState({
      issue: MOCK_ISSUE,
      plan: MOCK_PLAN,
      coderAttempts: 0,
    });
    const result = await node(state);

    expect(result.coderResult).toEqual(validCoderOutput);
    expect(result.coderAttempts).toBe(1);
  });

  it("includes review feedback in prompt when reviewResult is rejected", async () => {
    mockExec.mockResolvedValue("devel");
    mockStreamExec.mockResolvedValue({
      type: "result",
      structured_output: validCoderOutput,
    });

    const node = createCoderNode(docker, containerId);
    const state = createMockState({
      issue: MOCK_ISSUE,
      plan: MOCK_PLAN,
      reviewResult: MOCK_REVIEW_REJECTED,
    });
    await node(state);

    const cliArgs = mockStreamExec.mock.calls[0][2] as string[];
    expect(cliArgs).toContain("--model");
    expect(cliArgs[cliArgs.indexOf("--model") + 1]).toBe("sonnet");
    const promptIdx = cliArgs.indexOf("-p");
    const prompt = cliArgs[promptIdx + 1];
    expect(prompt).toContain("CODE REVIEW FEEDBACK");
    expect(prompt).toContain("Missing null check");
    expect(prompt).toContain("TEST FAILURES from review:");
    expect(prompt).toContain("auth.test.ts: expected true, got false");
  });

  it("returns error and increments attempts when CLI throws", async () => {
    mockExec.mockResolvedValue("devel");
    mockStreamExec.mockRejectedValue(new Error("OOM killed"));

    const node = createCoderNode(docker, containerId);
    const state = createMockState({
      issue: MOCK_ISSUE,
      plan: MOCK_PLAN,
      coderAttempts: 1,
    });
    const result = await node(state);

    expect(result.coderAttempts).toBe(2);
    expect(result.result).toEqual({
      errors: [{ node: "coder", message: "OOM killed", details: undefined }],
    });
  });

  it("returns error with Zod details when structured_output is invalid", async () => {
    mockExec.mockResolvedValue("devel");
    mockStreamExec.mockResolvedValue({
      type: "result",
      structured_output: { summary: 42 },
    });

    const node = createCoderNode(docker, containerId);
    const state = createMockState({
      issue: MOCK_ISSUE,
      plan: MOCK_PLAN,
      coderAttempts: 0,
    });
    const result = await node(state);

    expect(result.coderAttempts).toBe(1);
    expect(result.result?.errors).toHaveLength(1);
    expect(result.result?.errors[0].node).toBe("coder");
    expect(result.result?.errors[0].details).toBeDefined();
    expect(Array.isArray(result.result?.errors[0].details)).toBe(true);
  });

  it("returns costs on success when extractNodeCost returns a value", async () => {
    const mockCost = { node: "code_implementation", costUsd: 0.50, inputTokens: 5000, outputTokens: 3000 };
    mockExtractNodeCost.mockReturnValue(mockCost);
    mockExec.mockResolvedValue("devel");
    mockStreamExec.mockResolvedValue({
      type: "result",
      structured_output: validCoderOutput,
    });

    const node = createCoderNode(docker, containerId);
    const state = createMockState({ issue: MOCK_ISSUE, plan: MOCK_PLAN });
    const result = await node(state);

    expect(result.costs).toEqual([mockCost]);
  });

  it("returns empty costs when extractNodeCost returns null", async () => {
    mockExec.mockResolvedValue("devel");
    mockStreamExec.mockResolvedValue({
      type: "result",
      structured_output: validCoderOutput,
    });

    const node = createCoderNode(docker, containerId);
    const state = createMockState({ issue: MOCK_ISSUE, plan: MOCK_PLAN });
    const result = await node(state);

    expect(result.costs).toEqual([]);
  });

  it("returns costs on Zod error when CLI succeeded", async () => {
    const mockCost = { node: "code_implementation", costUsd: 0.30, inputTokens: 3000, outputTokens: 1000 };
    mockExtractNodeCost.mockReturnValue(mockCost);
    mockExec.mockResolvedValue("devel");
    mockStreamExec.mockResolvedValue({
      type: "result",
      structured_output: { summary: 42 },
    });

    const node = createCoderNode(docker, containerId);
    const state = createMockState({ issue: MOCK_ISSUE, plan: MOCK_PLAN });
    const result = await node(state);

    expect(result.result?.errors).toHaveLength(1);
    expect(result.costs).toEqual([mockCost]);
  });

  it("returns empty costs when CLI throws", async () => {
    mockExec.mockResolvedValue("devel");
    mockStreamExec.mockRejectedValue(new Error("OOM killed"));

    const node = createCoderNode(docker, containerId);
    const state = createMockState({ issue: MOCK_ISSUE, plan: MOCK_PLAN });
    const result = await node(state);

    expect(result.costs).toEqual([]);
  });
});
