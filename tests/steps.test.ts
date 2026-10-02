import { describe, it, expect } from "vitest";
import { pickStep } from "../lib/steps";

const mk = (...lines: number[]) => ({ steps: lines.map((line) => ({ line, title: "", explain: "", vars: [], output: "" })) });

describe("pickStep", () => {
  it("returns 0 for empty steps or null focus", () => {
    expect(pickStep(mk(), 3)).toBe(0);
    expect(pickStep(mk(1, 2), null)).toBe(0);
  });
  it("prefers the last step on the exact line", () => {
    expect(pickStep(mk(1, 2, 2, 2, 3), 2)).toBe(3);
  });
  it("falls back to the nearest earlier line", () => {
    expect(pickStep(mk(1, 4, 9), 6)).toBe(1);
  });
  it("returns 0 when focus is before every step", () => {
    expect(pickStep(mk(5, 6), 2)).toBe(0);
  });
});
