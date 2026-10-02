import { describe, expect, it } from "vitest";
import { runC } from "../lib/c/interp";

const SRC = `#include <stdio.h>
int main() {
  int n;
  printf("n: ");
  scanf("%d", &n);
  printf("%d", n);
  return 0;
}
`;

describe("input needed", () => {
  it("flags the scanf step when stdin is empty", () => {
    const r = runC(SRC, "");
    expect(r.inputNeededAt).not.toBeNull();
    expect(r.steps[r.inputNeededAt!].line).toBe(5);
  });
  it("does not flag when input is provided", () => {
    expect(runC(SRC, "4").inputNeededAt).toBeNull();
  });
  it("does not flag when input is closed with EOF", () => {
    expect(runC(SRC, "", true).inputNeededAt).toBeNull();
  });
});
