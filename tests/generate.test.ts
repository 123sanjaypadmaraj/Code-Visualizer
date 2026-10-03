import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildGeneratePrompt, cleanGenerated, generateCode } from "../lib/generate";
import { askLLM } from "../lib/complete";

vi.mock("../lib/complete", () => ({ askLLM: vi.fn() }));
const ask = vi.mocked(askLLM);
const GOOD = "#include <stdio.h>\nint main() {\n  return 0;\n}";
const BAD = "int main( {\n  return 0;\n}";

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
  it("includes the request and the current program", () => {
    const p = buildGeneratePrompt("sum an array", "int main() {\n", "\n}");
    expect(p).toContain("REQUEST: sum an array");
    expect(p).toContain("int main() {\n\n}");
  });
});

describe("generateCode", () => {
  beforeEach(() => ask.mockReset());
  it("returns a valid program after one call", async () => {
    ask.mockResolvedValueOnce(GOOD);
    expect(await generateCode("x", "", "")).toEqual({ code: GOOD });
    expect(ask).toHaveBeenCalledTimes(1);
  });
  it("retries once with the parser error", async () => {
    ask.mockResolvedValueOnce(BAD).mockResolvedValueOnce(GOOD);
    expect(await generateCode("x", "", "")).toEqual({ code: GOOD });
    expect(ask).toHaveBeenCalledTimes(2);
    expect(ask.mock.calls[1][1]).toContain("failed to parse");
  });
  it("returns the code with a warning when it still fails", async () => {
    ask.mockResolvedValue(BAD);
    const r = await generateCode("x", "", "");
    expect(r.code).toBe(BAD);
    expect(r.warning).toContain("may not compile");
    expect(ask).toHaveBeenCalledTimes(2);
  });
});
