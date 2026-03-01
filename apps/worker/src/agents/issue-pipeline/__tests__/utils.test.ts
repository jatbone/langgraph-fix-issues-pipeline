import { describe, it, expect } from "vitest";
import { slugify } from "../utils.js";

describe("slugify", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(slugify("Fix Login Bug")).toBe("fix-login-bug");
  });

  it("strips leading and trailing hyphens", () => {
    expect(slugify("--hello-world--")).toBe("hello-world");
  });

  it("replaces special characters with hyphens", () => {
    expect(slugify("hello@world! #2024")).toBe("hello-world-2024");
  });

  it("collapses consecutive hyphens", () => {
    expect(slugify("foo---bar")).toBe("foo-bar");
  });

  it("truncates to 60 characters and strips trailing hyphens after truncation", () => {
    const long = "a".repeat(55) + " bcdef ghijk";
    const result = slugify(long);
    expect(result.length).toBeLessThanOrEqual(60);
    expect(result.endsWith("-")).toBe(false);
  });

  it("returns empty string for empty input", () => {
    expect(slugify("")).toBe("");
  });

  it("returns empty string for special-chars-only input", () => {
    expect(slugify("!@#$%^&*()")).toBe("");
  });
});
