import { describe, it, expect, vi, beforeEach } from "vitest";
import { ZodError } from "zod";

const mockInvoke = vi.fn();

vi.mock("@langchain/anthropic", () => {
  return {
    ChatAnthropic: class {
      withStructuredOutput() {
        return { invoke: mockInvoke };
      }
    },
  };
});

vi.mock("../logger.js", () => ({
  logger: {
    nodeStart: vi.fn(),
    nodeEnd: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { createFormatInputNode } from "../format-input-node.js";
import { createMockState } from "./helpers.js";

describe("createFormatInputNode", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it("returns cleaned issue on success", async () => {
    mockInvoke.mockResolvedValue({ issueText: "Cleaned text" });

    const node = createFormatInputNode();
    const state = createMockState({ inputText: "Raw text" });
    const result = await node(state);

    expect(result).toEqual({
      issue: {
        text: "Raw text",
        cleaned: "Cleaned text",
      },
    });
  });

  it("returns error when LLM throws", async () => {
    mockInvoke.mockRejectedValue(new Error("API timeout"));

    const node = createFormatInputNode();
    const state = createMockState({ inputText: "Raw text" });
    const result = await node(state);

    expect(result).toEqual({
      result: {
        errors: [
          {
            node: "format_input",
            message: "API timeout",
            details: undefined,
          },
        ],
      },
    });
  });

  it("includes Zod details when validation fails", async () => {
    mockInvoke.mockResolvedValue({ issueText: 123 });

    const node = createFormatInputNode();
    const state = createMockState({ inputText: "Raw text" });
    const result = await node(state);

    expect(result.result?.errors).toHaveLength(1);
    expect(result.result?.errors[0].node).toBe("format_input");
    expect(result.result?.errors[0].details).toBeDefined();
    expect(Array.isArray(result.result?.errors[0].details)).toBe(true);
  });
});
