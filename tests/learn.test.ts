import { describe, expect, it } from "vitest";
import { runC } from "../lib/c/interp";
import { buildTraceTable, computeStats, questionFor } from "../lib/learn";

const src = `#include <stdio.h>
int main() {
    int total = 0;
    for (int i = 1; i <= 3; i++) {
        total = total + i;
    }
    printf("%d\\n", total);
    return 0;
}
`;
const lines = src.split("\n");
const lineText = (n: number) => lines[n - 1] ?? "";
const run = runC(src);

describe("learning helpers", () => {
  it("builds a trace table with a column per variable", () => {
    const t = buildTraceTable(run.steps);
    expect(t.columns).toEqual(expect.arrayContaining(["main.total", "main.i"]));
    const col = t.columns.indexOf("main.total");
    const seen = t.rows.map((r) => r.cells[col]).filter((c) => c !== null);
    expect(seen).toEqual(["0", "1", "3", "6"]);
  });

  it("limits the table to the steps seen so far", () => {
    const full = buildTraceTable(run.steps);
    const part = buildTraceTable(run.steps, 2);
    expect(part.rows.length).toBeLessThan(full.rows.length);
  });

  it("counts line executions and stack depth", () => {
    const s = computeStats(run.steps);
    expect(s.hits.get(5)).toBe(3); // loop body
    expect(s.maxDepth).toBe(1);
    expect(s.hottest[0].count).toBeGreaterThanOrEqual(3);
    expect(computeStats(run.steps, 0).hits.size).toBe(0);
  });

  it("tracks recursion depth and heap use", () => {
    const r = runC(`#include <stdlib.h>
int f(int n) { if (n == 0) return 0; return f(n - 1); }
int main() { int *p = malloc(16); f(3); free(p); return 0; }`);
    const s = computeStats(r.steps);
    expect(s.maxDepth).toBe(5);
    expect(s.peakHeapBytes).toBe(16);
    expect(s.liveHeapBytes).toBe(0);
    expect(s.calls).toBeGreaterThan(0);
  });

  it("asks for the next value and a true/false condition, with the right answers", () => {
    const qs = run.steps.map((_, i) => questionFor(run.steps, i, lineText));
    const value = qs.find((q) => q?.kind === "value");
    expect(value).toBeTruthy();
    expect(value!.choices).toContain(value!.answer);
    expect(new Set(value!.choices).size).toBe(value!.choices.length);
    const cond = qs.find((q) => q?.kind === "cond");
    expect(cond).toBeTruthy();
    expect(["true", "false"]).toContain(cond!.answer);
  });

  it("is deterministic and returns null past the end", () => {
    expect(questionFor(run.steps, 3, lineText)).toEqual(questionFor(run.steps, 3, lineText));
    expect(questionFor(run.steps, run.steps.length - 1, lineText)).toBeNull();
  });
});
