import { describe, expect, it } from "vitest";
import { buildGeneratePrompt, cleanGenerated } from "../lib/generate";

describe("cleanGenerated", () => {
  it("strips markdown fences and surrounding blank lines", () => {
    expect(cleanGenerated("```c\nint x = 1;\n```")).toBe("int x = 1;");
    expect(cleanGenerated("\n\nint x;\n\n")).toBe("int x;");
  });
  it("removes a leaked cursor marker and caps the length", () => {
    expect(cleanGenerated("a<CURSOR>b")).toBe("ab");
    expect(cleanGenerated("x\n".repeat(500)).split("\n").length).toBeLessThanOrEqual(120);
  });
  it("returns empty for blank replies", () => {
    expect(cleanGenerated("  \n ")).toBe("");
  });
});

describe("buildGeneratePrompt", () => {
  it("marks the cursor between before and after", () => {
    const p = buildGeneratePrompt("sum an array", "int main() {\n", "\n}");
    expect(p).toContain("REQUEST: sum an array");
    expect(p).toContain("int main() {\n<CURSOR>\n}");
  });
});
