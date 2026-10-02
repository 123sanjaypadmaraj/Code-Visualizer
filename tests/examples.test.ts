import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../lib/examples";
import { LESSONS } from "../lib/lessons";
import { runC } from "../lib/c/interp";

const expected: Record<string, string> = {
  "Binary search": "index = 5\n",
  "Selection sort": "5 10 13 14 29 37 \n",
  "Stack with array": "30\n20\n",
  "Binary search tree": "1 3 5 7 \n",
  Fibonacci: "5\n5\n",
  "Pointer arithmetic": "sum=30 len=7\n",
  "Bit manipulation": "3 45 40 35\n",
  "Bug: memory leak": "2\n",
};

describe("examples", () => {
  for (const ex of EXAMPLES) {
    it(`${ex.name} runs${ex.bug ? " and reports its bug" : ""}`, () => {
      const r = runC(ex.code, ex.stdin ? `${ex.stdin}\n` : "");
      expect(r.steps.length).toBeGreaterThan(0);
      if (ex.bug) expect(r.steps[r.steps.length - 1].kind).toBe("error");
      else expect(r.error).toBeNull();
      if (expected[ex.name]) expect(r.steps[r.steps.length - 1].output).toBe(expected[ex.name]);
    });
    it(`${ex.name} has a lesson`, () => {
      expect(LESSONS[ex.name]).toBeDefined();
    });
  }
  it("memory-leak example warns about the leak", () => {
    const ex = EXAMPLES.find((e) => e.name === "Bug: memory leak")!;
    expect(runC(ex.code).warnings.join(" ")).toMatch(/leak/i);
  });
});
