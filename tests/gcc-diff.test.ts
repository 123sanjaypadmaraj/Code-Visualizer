import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXAMPLES } from "../lib/examples";
import { runC } from "../lib/c/interp";

const hasGcc = spawnSync("gcc", ["--version"]).status === 0;
const dir = mkdtempSync(join(tmpdir(), "gccdiff-"));

function gccOutput(name: string, src: string, stdin: string): string {
  const base = join(dir, name.replace(/[^a-z0-9]/gi, "_"));
  writeFileSync(base + ".c", src);
  const build = spawnSync("gcc", ["-std=c11", "-w", base + ".c", "-o", base, "-lm"]);
  if (build.status !== 0) throw new Error(`gcc failed: ${build.stderr}`);
  const run = spawnSync(base, [], { input: stdin, timeout: 10000 });
  return run.stdout.toString().replace(/\r\n/g, "\n");
}

const programs = readdirSync(join(__dirname, "c-programs"))
  .filter((f) => f.endsWith(".c"))
  .map((f) => ({ name: f, code: readFileSync(join(__dirname, "c-programs", f), "utf8"), stdin: "" }));

const cases = [...EXAMPLES.filter((e) => !e.bug && !e.leak).map((e) => ({ name: e.name, code: e.code, stdin: e.stdin ? `${e.stdin}\n` : "" })), ...programs];

describe.skipIf(!hasGcc)("interpreter output matches gcc", () => {
  for (const c of cases) {
    it(c.name, () => {
      const r = runC(c.code, c.stdin, true);
      expect(r.error).toBeNull();
      expect(r.steps[r.steps.length - 1].output).toBe(gccOutput(c.name, c.code, c.stdin));
    }, 30000);
  }
});
