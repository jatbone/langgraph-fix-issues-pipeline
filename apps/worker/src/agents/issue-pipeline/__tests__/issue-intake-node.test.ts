import { describe, it, expect, vi, beforeEach } from "vitest";

const mockStreamExec = vi.fn();

vi.mock("../../../docker/index.js", () => ({
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

import { createIssueIntakeNode } from "../issue-intake-node.js";
import { createMockState, MOCK_ISSUE } from "./helpers.js";
import type Docker from "dockerode";

const docker = {} as Docker;
const containerId = "test-container";

describe("createIssueIntakeNode", () => {
  beforeEach(() => {
    mockStreamExec.mockReset();
  });

  it("returns error when state.issue is null", async () => {
    const node = createIssueIntakeNode(docker, containerId);
    const state = createMockState({ issue: null });
    const result = await node(state);

    expect(result.result?.errors[0].message).toBe("issue_intake requires state.issue");
  });

  it("returns parsed issue and increments attempts on success", async () => {
    const structured_output = {
      title: "Fix login bug",
      requirements: ["Fix button"],
      ambiguities: [],
      complexity: "low",
    };
    mockStreamExec.mockResolvedValue({ type: "result", structured_output });

    const node = createIssueIntakeNode(docker, containerId);
    const state = createMockState({
      issue: { text: "raw", cleaned: "cleaned", title: "", requirements: [], ambiguities: [], complexity: "low" },
      issueIntakeAttempts: 0,
    });
    const result = await node(state);

    expect(result.issue).toEqual({
      ...state.issue,
      ...structured_output,
    });
    expect(result.issueIntakeAttempts).toBe(1);
  });

  it("passes correct CLI args to streamExecInContainer", async () => {
    mockStreamExec.mockResolvedValue({
      type: "result",
      structured_output: {
        title: "Bug",
        requirements: [],
        ambiguities: [],
        complexity: "low",
      },
    });

    const node = createIssueIntakeNode(docker, containerId);
    const state = createMockState({
      issue: { text: "raw", cleaned: "clean text", title: "", requirements: [], ambiguities: [], complexity: "low" },
    });
    await node(state);

    expect(mockStreamExec).toHaveBeenCalledOnce();
    const args = mockStreamExec.mock.calls[0];
    expect(args[0]).toBe(docker);
    expect(args[1]).toBe(containerId);
    const cmd = args[2] as string[];
    expect(cmd[0]).toBe("claude");
    expect(cmd).toContain("--output-format");
    expect(cmd).toContain("stream-json");
    expect(cmd).toContain("--json-schema");
    expect(cmd).toContain("--dangerously-skip-permissions");
  });

  it("returns error and increments attempts when CLI throws", async () => {
    mockStreamExec.mockRejectedValue(new Error("CLI crashed"));

    const node = createIssueIntakeNode(docker, containerId);
    const state = createMockState({
      issue: { text: "raw", cleaned: "cleaned", title: "", requirements: [], ambiguities: [], complexity: "low" },
      issueIntakeAttempts: 1,
    });
    const result = await node(state);

    expect(result.issueIntakeAttempts).toBe(2);
    expect(result.result).toEqual({
      errors: [{ node: "issue_intake", message: "CLI crashed", details: undefined }],
    });
  });

  it("returns error with Zod details when structured_output is invalid", async () => {
    mockStreamExec.mockResolvedValue({
      type: "result",
      structured_output: { title: 123 },
    });

    const node = createIssueIntakeNode(docker, containerId);
    const state = createMockState({
      issue: { text: "raw", cleaned: "cleaned", title: "", requirements: [], ambiguities: [], complexity: "low" },
      issueIntakeAttempts: 0,
    });
    const result = await node(state);

    expect(result.issueIntakeAttempts).toBe(1);
    expect(result.result?.errors).toHaveLength(1);
    expect(result.result?.errors[0].node).toBe("issue_intake");
    expect(result.result?.errors[0].details).toBeDefined();
    expect(Array.isArray(result.result?.errors[0].details)).toBe(true);
  });
});
