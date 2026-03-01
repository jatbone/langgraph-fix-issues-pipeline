import { describe, it, expect, vi, beforeEach } from "vitest";

const mockExec = vi.fn();
const mockStreamExec = vi.fn();

vi.mock("../../../docker/index.js", () => ({
  execInContainer: (...args: unknown[]) => mockExec(...args),
  streamExecInContainer: (...args: unknown[]) => mockStreamExec(...args),
}));

vi.mock("../logger.js", () => ({
  logger: {
    nodeStart: vi.fn(),
    nodeEnd: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
    cliEvent: vi.fn(),
  },
}));

import { createIntegratorNode } from "../integrator-node.js";
import {
  createMockState,
  MOCK_ISSUE,
  MOCK_PLAN,
  MOCK_CODER_RESULT,
  MOCK_REVIEW_APPROVED,
} from "./helpers.js";
import type Docker from "dockerode";

const docker = {} as Docker;
const containerId = "test-container";

const validPrOutput = {
  prUrl: "https://github.com/org/repo/pull/42",
  prNumber: 42,
};

describe("createIntegratorNode", () => {
  beforeEach(() => {
    mockExec.mockReset();
    mockStreamExec.mockReset();
    mockExec.mockResolvedValue("devel");
  });

  it("returns error when state.issue is null", async () => {
    const node = createIntegratorNode(docker, containerId);
    const state = createMockState({
      issue: null,
      plan: MOCK_PLAN,
      coderResult: MOCK_CODER_RESULT,
    });
    const result = await node(state);

    expect(result.result?.errors[0].message).toBe("integrator requires state.issue");
  });

  it("returns error when state.plan is null", async () => {
    const node = createIntegratorNode(docker, containerId);
    const state = createMockState({
      issue: MOCK_ISSUE,
      plan: null,
      coderResult: MOCK_CODER_RESULT,
    });
    const result = await node(state);

    expect(result.result?.errors[0].message).toBe("integrator requires state.plan");
  });

  it("returns error when state.coderResult is null", async () => {
    const node = createIntegratorNode(docker, containerId);
    const state = createMockState({
      issue: MOCK_ISSUE,
      plan: MOCK_PLAN,
      coderResult: null,
    });
    const result = await node(state);

    expect(result.result?.errors[0].message).toBe("integrator requires state.coderResult");
  });

  it("returns error when state.baseBranch is empty", async () => {
    const node = createIntegratorNode(docker, containerId);
    const state = createMockState({
      issue: MOCK_ISSUE,
      plan: MOCK_PLAN,
      coderResult: MOCK_CODER_RESULT,
      baseBranch: "",
    });
    const result = await node(state);

    expect(result.result?.errors[0].message).toBe("integrator requires state.baseBranch");
  });

  it("checks out baseBranch when current branch mismatches", async () => {
    mockExec
      .mockResolvedValueOnce("wrong-branch") // branch --show-current
      .mockResolvedValue(""); // remaining calls
    mockStreamExec.mockResolvedValue({
      type: "result",
      structured_output: validPrOutput,
    });

    const node = createIntegratorNode(docker, containerId);
    const state = createMockState({
      issue: MOCK_ISSUE,
      plan: MOCK_PLAN,
      coderResult: MOCK_CODER_RESULT,
      reviewResult: MOCK_REVIEW_APPROVED,
    });
    await node(state);

    const checkoutCall = mockExec.mock.calls[1];
    const cmd = checkoutCall[2] as string[];
    expect(cmd).toContain("checkout");
    expect(cmd).toContain("devel");
  });

  it("sets git user identity before creating PR", async () => {
    mockStreamExec.mockResolvedValue({
      type: "result",
      structured_output: validPrOutput,
    });

    const node = createIntegratorNode(docker, containerId);
    const state = createMockState({
      issue: MOCK_ISSUE,
      plan: MOCK_PLAN,
      coderResult: MOCK_CODER_RESULT,
      reviewResult: MOCK_REVIEW_APPROVED,
    });
    await node(state);

    const emailCall = mockExec.mock.calls.find(
      (call) => (call[2] as string[]).includes("user.email"),
    );
    const nameCall = mockExec.mock.calls.find(
      (call) => (call[2] as string[]).includes("user.name"),
    );
    expect(emailCall).toBeDefined();
    expect(nameCall).toBeDefined();
  });

  it("writes contract and PR description files", async () => {
    mockStreamExec.mockResolvedValue({
      type: "result",
      structured_output: validPrOutput,
    });

    const node = createIntegratorNode(docker, containerId);
    const state = createMockState({
      issue: MOCK_ISSUE,
      plan: MOCK_PLAN,
      coderResult: MOCK_CODER_RESULT,
      reviewResult: MOCK_REVIEW_APPROVED,
    });
    await node(state);

    const contractCall = mockExec.mock.calls.find(
      (call) => (call[2] as string[]).join(" ").includes("integrator-rules.md"),
    );
    const prBodyCall = mockExec.mock.calls.find(
      (call) => (call[2] as string[]).join(" ").includes("pr-description.md"),
    );
    expect(contractCall).toBeDefined();
    expect(prBodyCall).toBeDefined();
  });

  it("returns integratorResult with branchName derived from slugified title", async () => {
    mockStreamExec.mockResolvedValue({
      type: "result",
      structured_output: validPrOutput,
    });

    const node = createIntegratorNode(docker, containerId);
    const state = createMockState({
      issue: MOCK_ISSUE,
      plan: MOCK_PLAN,
      coderResult: MOCK_CODER_RESULT,
      reviewResult: MOCK_REVIEW_APPROVED,
    });
    const result = await node(state);

    expect(result.integratorResult).toEqual({
      branchName: "fix/fix-login-bug",
      prUrl: validPrOutput.prUrl,
      prNumber: validPrOutput.prNumber,
    });
  });

  it("includes branch name and base branch in CLI prompt", async () => {
    mockStreamExec.mockResolvedValue({
      type: "result",
      structured_output: validPrOutput,
    });

    const node = createIntegratorNode(docker, containerId);
    const state = createMockState({
      issue: MOCK_ISSUE,
      plan: MOCK_PLAN,
      coderResult: MOCK_CODER_RESULT,
      reviewResult: MOCK_REVIEW_APPROVED,
    });
    await node(state);

    const cliArgs = mockStreamExec.mock.calls[0][2] as string[];
    const promptIdx = cliArgs.indexOf("-p");
    const prompt = cliArgs[promptIdx + 1];
    expect(prompt).toContain("fix/fix-login-bug");
    expect(prompt).toContain("Base branch (PR target): devel");
  });

  it("uses review summary as N/A when reviewResult is null", async () => {
    mockStreamExec.mockResolvedValue({
      type: "result",
      structured_output: validPrOutput,
    });

    const node = createIntegratorNode(docker, containerId);
    const state = createMockState({
      issue: MOCK_ISSUE,
      plan: MOCK_PLAN,
      coderResult: MOCK_CODER_RESULT,
      reviewResult: null,
    });
    await node(state);

    // PR description file should contain N/A for review summary
    const prBodyCall = mockExec.mock.calls.find(
      (call) => (call[2] as string[]).join(" ").includes("pr-description.md"),
    );
    const shellCmd = (prBodyCall![2] as string[])[2];
    expect(shellCmd).toContain("N/A");
  });

  it("returns error when CLI throws", async () => {
    mockStreamExec.mockRejectedValue(new Error("Push rejected"));

    const node = createIntegratorNode(docker, containerId);
    const state = createMockState({
      issue: MOCK_ISSUE,
      plan: MOCK_PLAN,
      coderResult: MOCK_CODER_RESULT,
    });
    const result = await node(state);

    expect(result.result).toEqual({
      errors: [{ node: "integrate", message: "Push rejected", details: undefined }],
    });
  });

  it("returns error with Zod details when structured_output is invalid", async () => {
    mockStreamExec.mockResolvedValue({
      type: "result",
      structured_output: { prUrl: 123 },
    });

    const node = createIntegratorNode(docker, containerId);
    const state = createMockState({
      issue: MOCK_ISSUE,
      plan: MOCK_PLAN,
      coderResult: MOCK_CODER_RESULT,
    });
    const result = await node(state);

    expect(result.result?.errors).toHaveLength(1);
    expect(result.result?.errors[0].node).toBe("integrate");
    expect(result.result?.errors[0].details).toBeDefined();
    expect(Array.isArray(result.result?.errors[0].details)).toBe(true);
  });
});
