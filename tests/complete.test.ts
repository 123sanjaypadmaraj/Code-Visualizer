import { describe, expect, it } from "vitest";
import { buildCompletePrompt, cleanCompletion } from "../lib/complete";

describe("cleanCompletion", () => {
  it("strips markdown fences", () => {
    expect(cleanCompletion("```c\nint x = 1;\n```")).toBe("int x = 1;");
  });
  it("returns empty for blank or whitespace output", () => {
    expect(cleanCompletion("   \n ")).toBe("");
  });
  it("removes a re-typed current line", () => {
    expect(cleanCompletion("    int total = 0;", "int main() {\n    int total = ")).toBe("0;");
    expect(cleanCompletion("for (int i = 0; i < n; i++) {", "for (")).toBe("int i = 0; i < n; i++) {");
  });
  it("caps lines and length", () => {
    const many = Array.from({ length: 20 }, (_, i) => `x${i};`).join("\n");
    expect(cleanCompletion(many).split("\n")).toHaveLength(8);
    expect(cleanCompletion("a".repeat(2000)).length).toBe(500);
  });
  it("drops a suggestion that only repeats the next line", () => {
    expect(cleanCompletion("return 0;", "int main() {\n  ", "return 0;\n}")).toBe("");
  });
  it("keeps trailing indentation out", () => {
    expect(cleanCompletion("x = 1;\n   ")).toBe("x = 1;");
  });
});

describe("buildCompletePrompt", () => {
  it("includes prefix and suffix", () => {
    const p = buildCompletePrompt("AAA", "BBB");
    expect(p).toContain("AAA");
    expect(p).toContain("BBB");
  });
});
