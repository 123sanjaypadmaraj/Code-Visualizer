import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../lib/examples";
import { runC } from "../lib/c/interp";

/** Half-typed programs must give a clear message, never a crash or an "Internal error". */
function check(src: string, stdin: string) {
  let r;
  try {
    r = runC(src, stdin, true);
  } catch (e) {
    throw new Error(`runC threw: ${e instanceof Error ? e.message : e}\n---\n${src}`);
  }
  expect(r.error ?? "", src).not.toMatch(/internal error/i);
}

describe("interpreter robustness on partial programs", () => {
  for (const ex of EXAMPLES) {
    it(`never crashes on prefixes and line deletions of "${ex.name}"`, () => {
      const lines = ex.code.split("\n");
      for (let i = 1; i < lines.length; i++) check(lines.slice(0, i).join("\n"), ex.stdin ?? "");
      for (let i = 0; i < lines.length; i++) check(lines.filter((_, j) => j !== i).join("\n"), ex.stdin ?? "");
    }, 60000);
  }
});
