import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildFixAllPrompt, fixAllCode } from "../lib/fix";
import { askLLM } from "../lib/complete";

vi.mock("../lib/complete", () => ({ askLLM: vi.fn() }));
const ask = vi.mocked(askLLM);
const GOOD = "#include <stdio.h>\nint main() {\n  printf(\"hi\");\n  return 0;\n}";
const BROKEN = "#include <stdio.h>\nint main() {\n  printf(\"hi\")\n  return 0;\n}";

describe("buildFixAllPrompt", () => {
  it("includes the program, the hint and detected problems", () => {
    const p = buildFixAllPrompt("int x", "sum 1..n", ["line 1: missing ;"]);
    expect(p).toContain("HINT from the student: sum 1..n");
    expect(p).toContain("- line 1: missing ;");
    expect(p).toContain("int x");
  });
});

describe("fixAllCode", () => {
  beforeEach(() => ask.mockReset());
  it("returns the repaired program and tells the model about detected errors", async () => {
    ask.mockResolvedValueOnce("```c\n" + GOOD + "\n```");
    expect(await fixAllCode(BROKEN)).toEqual({ code: GOOD });
    expect(ask.mock.calls[0][1]).toContain("Problems already detected");
  });
  it("retries once when the result does not parse, then warns", async () => {
    ask.mockResolvedValue(BROKEN);
    const r = await fixAllCode(BROKEN);
    expect(r.warning).toContain("may not compile");
    expect(ask).toHaveBeenCalledTimes(2);
  });
  it("does not truncate programs longer than the /ai limit", async () => {
    const big = GOOD.replace("return 0;", "int a;\n".repeat(150) + "return 0;");
    ask.mockResolvedValueOnce(big);
    expect((await fixAllCode(big)).code).toBe(big);
  });
});
