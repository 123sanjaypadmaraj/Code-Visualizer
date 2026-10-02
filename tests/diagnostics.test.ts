import { describe, expect, it } from "vitest";
import { diagnose, type Diag } from "../lib/diagnostics";
import { EXAMPLES } from "../lib/examples";

const apply = (src: string, d: Diag) => (d.fix ? src.slice(0, d.fix.from) + d.fix.insert + src.slice(d.fix.to) : src);
const wrap = (body: string) => `#include <stdio.h>\nint main() {\n${body}\n    return 0;\n}\n`;

describe("diagnose", () => {
  it("reports nothing for every example program", () => {
    for (const ex of EXAMPLES) expect(diagnose(ex.code), ex.name).toEqual([]);
  });

  it("underlines the end of the line for a missing semicolon and offers a fix", () => {
    const src = wrap("    int x = 5\n    int y = 6;");
    const [d] = diagnose(src);
    expect(d.severity).toBe("error");
    expect(d.message).toMatch(/Expected ';'/);
    expect(src.slice(d.from, d.to)).toBe("5");
    expect(d.line).toBe(3);
    expect(diagnose(apply(src, d))).toEqual([]);
  });

  it("flags a missing closing quote on the string and fixes it", () => {
    const src = wrap('    printf("hi);');
    const [d] = diagnose(src);
    expect(d.message).toMatch(/Unterminated string/);
    expect(src.slice(d.from, d.to).startsWith('"hi')).toBe(true);
    expect(d.fix?.insert).toBe('"');
  });

  it("flags a missing closing parenthesis", () => {
    const src = wrap("    int x = (3 + 4;");
    const [d] = diagnose(src);
    expect(d.severity).toBe("error");
    expect(d.line).toBe(3);
  });

  it("points at the unclosed brace, not the end of the file", () => {
    const src = "#include <stdio.h>\nint main() {\n    int x = 1;\n    return 0;\n";
    const [d] = diagnose(src);
    expect(d.message).toMatch(/Unclosed '\{'/);
    expect(src.slice(d.from, d.to)).toBe("{");
    expect(diagnose(apply(src, d))).toEqual([]);
  });

  it("handles an unexpected character", () => {
    const src = wrap("    int x = 5 @ 3;");
    const [d] = diagnose(src);
    expect(src.slice(d.from, d.to)).toBe("@");
  });

  it("warns about a missing #include and offers to add it", () => {
    const src = "int main() {\n    printf(\"hi\\n\");\n    return 0;\n}\n";
    const ds = diagnose(src);
    expect(ds).toHaveLength(1);
    expect(ds[0].severity).toBe("warning");
    expect(ds[0].message).toContain("stdio.h");
    expect(diagnose(apply(src, ds[0]))).toEqual([]);
  });

  it("warns about assignment inside a condition", () => {
    const src = wrap("    int x = 1;\n    if (x = 2) {\n        x = 3;\n    }");
    const ds = diagnose(src);
    expect(ds).toHaveLength(1);
    expect(ds[0].message).toContain("==");
    expect(apply(src, ds[0])).toContain("if (x == 2)");
  });

  it("does not warn for == comparisons or for loops with assignment", () => {
    expect(diagnose(wrap("    int x = 1;\n    if (x == 1) { x = 2; }\n    for (int i = 0; i < 3; i++) { x = i; }"))).toEqual([]);
  });

  it("returns nothing for empty input", () => {
    expect(diagnose("   \n")).toEqual([]);
  });
});
