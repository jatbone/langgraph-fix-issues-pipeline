import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db/index.js", () => ({
  markSuccess: vi.fn(),
  markFailed: vi.fn(),
}));

vi.mock("../logger.js", () => ({
  logger: {
    summary: vi.fn(),
    log: vi.fn(),
  },
}));

import { createLogAndNotifyNode } from "../log-and-notify-node.js";
import { markSuccess, markFailed } from "../../../db/index.js";
import { createMockState } from "./helpers.js";

describe("createLogAndNotifyNode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty object when db is null", async () => {
    const node = createLogAndNotifyNode(null);
    const state = createMockState({ issueId: 1 });
    const result = await node(state);

    expect(result).toEqual({});
    expect(markSuccess).not.toHaveBeenCalled();
    expect(markFailed).not.toHaveBeenCalled();
  });

  it("calls markFailed when db is present and there are errors", async () => {
    const fakeDb = {} as any;
    const node = createLogAndNotifyNode(fakeDb);
    const state = createMockState({
      issueId: 42,
      result: {
        errors: [
          { node: "coder", message: "compile error" },
          { node: "review", message: "tests failed" },
        ],
      },
    });
    await node(state);

    expect(markFailed).toHaveBeenCalledWith(
      fakeDb,
      42,
      "[coder] compile error; [review] tests failed",
    );
    expect(markSuccess).not.toHaveBeenCalled();
  });

  it("calls markSuccess when db is present and no errors", async () => {
    const fakeDb = {} as any;
    const node = createLogAndNotifyNode(fakeDb);
    const state = createMockState({
      issueId: 7,
      coderResult: { summary: "Fixed the bug", filesChanged: ["src/a.ts"] },
      integratorResult: { branchName: "fix/bug", prUrl: "https://pr/1", prNumber: 1 },
    });
    await node(state);

    expect(markSuccess).toHaveBeenCalledWith(
      fakeDb,
      7,
      "Fixed the bug",
      "https://pr/1",
    );
    expect(markFailed).not.toHaveBeenCalled();
  });

  it("does not call db functions when issueId is null", async () => {
    const fakeDb = {} as any;
    const node = createLogAndNotifyNode(fakeDb);
    const state = createMockState({ issueId: null });
    await node(state);

    expect(markSuccess).not.toHaveBeenCalled();
    expect(markFailed).not.toHaveBeenCalled();
  });

  it("uses default summary when coderResult is null", async () => {
    const fakeDb = {} as any;
    const node = createLogAndNotifyNode(fakeDb);
    const state = createMockState({ issueId: 1 });
    await node(state);

    expect(markSuccess).toHaveBeenCalledWith(
      fakeDb,
      1,
      "Pipeline completed",
      null,
    );
  });
});
