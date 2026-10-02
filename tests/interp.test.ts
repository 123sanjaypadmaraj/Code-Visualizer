import { describe, expect, it } from "vitest";
import { runC } from "../lib/c/interp";

const out = (src: string, stdin = "") => {
  const r = runC(src, stdin);
  return { r, text: r.steps.length ? r.steps[r.steps.length - 1].output : "" };
};

describe("C interpreter", () => {
  it("runs arrays, pointers and printf", () => {
    const { r, text } = out(`#include <stdio.h>
int main() {
  int nums[5] = {10, 20, 30, 40, 50};
  nums[2] = 99;
  int *p = &nums[0];
  p = p + 1;
  printf("%d %d\\n", *p, nums[2]);
  return 0;
}`);
    expect(r.error).toBeNull();
    expect(text).toBe("20 99\n");
    const last = r.steps[r.steps.length - 1];
    expect(last.kind).toBe("end");
  });

  it("handles loops, functions and recursion", () => {
    const { r, text } = out(`#include <stdio.h>
int fact(int n) { if (n <= 1) return 1; return n * fact(n - 1); }
int main() {
  int total = 0;
  for (int i = 1; i <= 4; i++) total += i;
  printf("%d %d\\n", total, fact(5));
  return 0;
}`);
    expect(r.error).toBeNull();
    expect(text).toBe("10 120\n");
    expect(Math.max(...r.steps.map((s) => s.frames.length))).toBe(6);
  });

  it("supports structs, typedefs and arrows", () => {
    const { r, text } = out(`#include <stdio.h>
#include <stdlib.h>
typedef struct Node { int val; struct Node *next; } Node;
int main() {
  Node *a = malloc(sizeof(Node));
  Node *b = malloc(sizeof(Node));
  a->val = 1; a->next = b;
  b->val = 2; b->next = NULL;
  int s = 0;
  for (Node *c = a; c != NULL; c = c->next) s += c->val;
  printf("%d\\n", s);
  free(a); free(b);
  return 0;
}`);
    expect(r.error).toBeNull();
    expect(text).toBe("3\n");
    expect(r.warnings).toEqual([]);
    const last = r.steps[r.steps.length - 1];
    expect(last.heap).toHaveLength(2);
    expect(last.heap.every((h) => h.freed)).toBe(true);
  });

  it("formats numbers like printf", () => {
    const { text } = out(`#include <stdio.h>
int main() {
  printf("%5d|%-5d|%05d|%x|%c|%s|%.2f|%5.1f|%ld\\n", 42, 42, 42, 255, 'A', "hi", 3.14159, 2.55, 123456789012L);
  return 0;
}`);
    expect(text).toBe("   42|42   |00042|ff|A|hi|3.14|  2.5|123456789012\n");
  });

  it("keeps 64-bit integers exact", () => {
    const { text } = out(`#include <stdio.h>
int main() {
  long long f = 1;
  for (int i = 1; i <= 20; i++) f *= i;
  printf("%lld\\n", f);
  return 0;
}`);
    expect(text).toBe("2432902008176640000\n");
  });

  it("reads scanf input", () => {
    const { r, text } = out(
      `#include <stdio.h>
int main() { int a, b; scanf("%d %d", &a, &b); printf("%d\\n", a + b); return 0; }`,
      "3 4",
    );
    expect(r.error).toBeNull();
    expect(text).toBe("7\n");
  });

  it("reports out-of-bounds, NULL and use-after-free", () => {
    expect(out(`int main(){ int a[3]; a[5] = 1; return 0; }`).r.error).toMatch(/out of bounds/);
    expect(out(`int main(){ int *p = 0; *p = 1; return 0; }`).r.error).toMatch(/NULL/);
    expect(
      out(`#include <stdlib.h>
int main(){ int *p = malloc(4); free(p); *p = 1; return 0; }`).r.error,
    ).toMatch(/Use after free/);
    expect(out(`int main(){ int x = 1 / 0; return x; }`).r.error).toMatch(/Division by zero/);
  });

  it("warns about memory leaks and uninitialized reads", () => {
    const leak = out(`#include <stdlib.h>
int main(){ int *p = malloc(8); return 0; }`);
    expect(leak.r.warnings.join(" ")).toMatch(/leak/i);
    const un = out(`#include <stdio.h>
int main(){ int x; printf("%d", x); return 0; }`);
    expect(un.r.warnings.join(" ")).toMatch(/before it was given a value/);
  });

  it("reports parse errors with a line number", () => {
    const r = runC(`int main() {\n  int x = 5\n  return 0;\n}`);
    expect(r.error).toMatch(/Expected ';'/);
    expect(r.errorLine).toBe(2);
  });

  it("stops infinite loops after the step cap", () => {
    const r = runC(`int main(){ int i = 0; while (1) { i++; } return 0; }`);
    expect(r.truncated).toBe(true);
  });

  it("supports switch, 2D arrays, strings and function pointers", () => {
    const { r, text } = out(`#include <stdio.h>
#include <string.h>
int add(int a, int b) { return a + b; }
int main() {
  int m[2][3] = {{1,2,3},{4,5,6}};
  char s[16] = "Hello";
  strcat(s, "!");
  int (*op)(int,int) = add;
  switch (m[1][2]) { case 6: printf("six "); break; default: printf("other "); }
  printf("%s %d %d\\n", s, (int)strlen(s), op(2, 3));
  return 0;
}`);
    expect(r.error).toBeNull();
    expect(text).toBe("six Hello! 6 5\n");
  });

  it("supports macros, enums and globals", () => {
    const { r, text } = out(`#include <stdio.h>
#define SQ(x) ((x) * (x))
#define N 3
enum Color { RED, GREEN = 5, BLUE };
int counter = 7;
int main() {
  int a[N];
  for (int i = 0; i < N; i++) a[i] = SQ(i);
  printf("%d %d %d %d\\n", a[2], BLUE, counter, sizeof(a));
  return 0;
}`);
    expect(r.error).toBeNull();
    expect(text).toBe("4 6 7 12\n");
  });
});

import { EXAMPLES } from "../lib/examples";

describe("example programs", () => {
  for (const ex of EXAMPLES) {
    it(`runs "${ex.name}"`, () => {
      const r = runC(ex.code, ex.stdin ?? "");
      if (ex.bug) expect(r.error).not.toBeNull();
      else {
        expect(r.error).toBeNull();
        if (ex.leak) expect(r.warnings.join(" ")).toMatch(/leak/i);
        else expect(r.warnings).toEqual([]);
        expect(r.steps[r.steps.length - 1].kind).toBe("end");
      }
      expect(r.steps.length).toBeGreaterThan(2);
    });
  }
});
