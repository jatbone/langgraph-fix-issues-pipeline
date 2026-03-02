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

import { createPlanNode } from "../plan-node.js";
import { createMockState, MOCK_ISSUE } from "./helpers.js";
import type Docker from "dockerode";

const docker = {} as Docker;
const containerId = "test-container";

describe("createPlanNode", () => {
  beforeEach(() => {
    mockExec.mockReset();
    mockStreamExec.mockReset();
    mockExec.mockResolvedValue("");
  });

  it("returns error when state.issue is null", async () => {
    const node = createPlanNode(docker, containerId);
    const state = createMockState({ issue: null });
    const result = await node(state);

    expect(result.result?.errors[0].message).toBe("plan requires state.issue");
  });

  it("writes contract file and calls CLI on success", async () => {
    const structured_output = {
      approach: "Fix the auth module",
      steps: ["Step 1"],
      risks: [],
      estimatedScope: "small",
      filesToModify: ["src/auth.ts"],
    };
    mockStreamExec.mockResolvedValue({ type: "result", structured_output });

    const node = createPlanNode(docker, containerId);
    const state = createMockState({ issue: MOCK_ISSUE });
    const result = await node(state);

    // Verify contract file was written via execInContainer
    expect(mockExec).toHaveBeenCalledOnce();
    const execArgs = mockExec.mock.calls[0];
    expect(execArgs[0]).toBe(docker);
    expect(execArgs[1]).toBe(containerId);
    const cmd = execArgs[2] as string[];
    expect(cmd[0]).toBe("sh");
    expect(cmd[2]).toContain("planner-rules.md");

    // Verify CLI was called
    expect(mockStreamExec).toHaveBeenCalledOnce();
    const streamArgs = mockStreamExec.mock.calls[0];
    const streamCmd = streamArgs[2] as string[];
    expect(streamCmd[0]).toBe("claude");
    expect(streamCmd).toContain("--model");
    expect(streamCmd[streamCmd.indexOf("--model") + 1]).toBe("sonnet");
    expect(streamCmd).toContain("--json-schema");
    expect(streamCmd).toContain("--append-system-prompt-file");

    expect(result.plan).toEqual(structured_output);
  });

  it("returns error when CLI throws", async () => {
    mockStreamExec.mockRejectedValue(new Error("Container died"));

    const node = createPlanNode(docker, containerId);
    const state = createMockState({ issue: MOCK_ISSUE });
    const result = await node(state);

    expect(result.result).toEqual({
      errors: [{ node: "plan", message: "Container died", details: undefined }],
    });
  });

  it("returns error with Zod details when structured_output is invalid", async () => {
    mockStreamExec.mockResolvedValue({
      type: "result",
      structured_output: { approach: 999 },
    });

    const node = createPlanNode(docker, containerId);
    const state = createMockState({ issue: MOCK_ISSUE });
    const result = await node(state);

    expect(result.result?.errors).toHaveLength(1);
    expect(result.result?.errors[0].node).toBe("plan");
    expect(result.result?.errors[0].details).toBeDefined();
    expect(Array.isArray(result.result?.errors[0].details)).toBe(true);
  });
});
