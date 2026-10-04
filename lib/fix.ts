import { askLLM } from "./complete";
import { diagnose } from "./diagnostics";
import { clean, parseProblem } from "./generate";

export const FIX_SYSTEM = `You are a friendly C tutor inside a learning tool. A student's program has a problem on one line.
Reply with ONLY a JSON object: {"explanation": string, "replacement": string, "endLine": number}
- "explanation": 1-2 plain sentences telling the student what was wrong and why the fix works. No code fences.
- "replacement": the corrected text for the marked line (keep its indentation, no trailing newline). It must replace the whole line.
- "endLine": the last line number that "replacement" replaces. Normally the marked line itself. Only if the problem really spans several lines (for example a string literal broken across lines), set it to a later line (at most 3 lines after the marked one) and make "replacement" the corrected text for that whole range.
Change as little as possible. Do not rewrite other lines.`;

export interface AiFix {
  explanation: string;
  replacement: string;
  /** last line replaced (same as the problem line unless the fix spans several lines) */
  endLine?: number;
}

const MAX_SPAN = 4;

export function buildFixPrompt(code: string, line: number, message: string): string {
  const lines = code.split("\n");
  const from = Math.max(0, line - 6);
  const view = lines
    .slice(from, line + 4)
    .map((l, i) => `${from + i + 1}${from + i + 1 === line ? ">" : " "} ${l}`)
    .join("\n");
  return `Problem on line ${line}: ${message}\n\nCode (line ${line} is marked with >):\n${view}\n\nReturn the JSON.`;
}

/** Parse the model reply; returns null if it is unusable. A multi-line replacement is only accepted together with a matching endLine. */
export function parseFix(raw: string, original: string, line = 1, lineCount = Infinity): AiFix | null {
  const a = raw.indexOf("{");
  const b = raw.lastIndexOf("}");
  if (a < 0 || b < a) return null;
  try {
    const j = JSON.parse(raw.slice(a, b + 1));
    if (typeof j.replacement !== "string") return null;
    const replacement = j.replacement.replace(/\r/g, "").replace(/\n+$/, "");
    const end = Number.isInteger(j.endLine) ? Number(j.endLine) : line;
    if (end < line || end - line + 1 > MAX_SPAN || end > lineCount) return null;
    const span = end - line + 1;
    if (!replacement.trim() || replacement.split("\n").length > span || replacement.length > 400 * span || replacement === original) return null;
    const explanation = typeof j.explanation === "string" ? j.explanation.trim().slice(0, 400) : "";
    const fix: AiFix = { explanation: explanation || "Updated the line to fix the error.", replacement };
    if (end > line) fix.endLine = end;
    return fix;
  } catch {
    return null;
  }
}

export async function suggestFix(code: string, line: number, message: string, signal?: AbortSignal): Promise<AiFix | null> {
  const lines = code.split("\n");
  const raw = await askLLM(FIX_SYSTEM, buildFixPrompt(code, line, message), { maxTokens: 400, signal });
  const fix = parseFix(raw, lines[line - 1] ?? "", line, lines.length);
  // a multi-line fix that just restates the lines it replaces changes nothing
  if (fix?.endLine && fix.replacement === lines.slice(line - 1, fix.endLine).join("\n")) return null;
  return fix;
}

/** The AI fix was computed for `expected`; only apply it if the student has not edited those lines meanwhile. */
export function fixStillApplies(doc: string, line: number, endLine: number, expected: string[]): boolean {
  const lines = doc.split("\n");
  if (endLine > lines.length) return false;
  const cur = lines.slice(line - 1, endLine);
  return cur.length === expected.length && cur.every((l, i) => l === expected[i]);
}

/** Describe the result of an applied fix: did the error on that line go away? */
export function fixOutcome(remaining: { severity: string; line: number }[], line: number, explanation: string): string {
  const still = remaining.some((d) => d.severity === "error" && d.line === line);
  return still ? `AI fix: ${explanation} (this line still has an error, try again or edit it by hand)` : `AI fix: ${explanation}`;
}

/* ------------------------- "/fix": repair the whole program ------------------------- */

export const FIXALL_SYSTEM = `You are a friendly C tutor inside a learning tool. A student wrote a C program that has errors.
Work out what the program is MEANT to do (from its names, comments, structure and any HINT), then return the corrected program.
Reply with ONLY the complete corrected C program.
Rules:
- Plain C (C99), standard library only.
- Fix every syntax error, type error, missing include/semicolon/brace, undeclared variable, off-by-one, infinite loop, memory or logic bug that stops the program from doing its intended job.
- Keep the student's structure, variable names, style and comments. Change as little as possible; do not rewrite working code or add new features.
- Output raw code: no markdown fences, no explanations. If you changed something non-obvious, add a short // comment on that line.`;

export function buildFixAllPrompt(code: string, hint: string, problems: string[]): string {
  const found = problems.length ? `\nProblems already detected by the tool:\n${problems.map((p) => `- ${p}`).join("\n")}\n` : "";
  return `${hint ? `HINT from the student: ${hint}\n` : ""}${found}
PROGRAM:
<<<
${code}
>>>

Return the complete corrected program:`;
}

const FIXALL_LINES = 300;
const FIXALL_CHARS = 9000;

export interface FixedAll {
  code: string;
  /** set when the result is cut short or still does not parse */
  warning?: string;
}

/** Send the whole program to the model and get the repaired program back; retries once if the result does not parse. */
export async function fixAllCode(code: string, hint = "", signal?: AbortSignal): Promise<FixedAll> {
  const problems = diagnose(code)
    .filter((d) => d.severity === "error")
    .map((d) => `line ${d.line}: ${d.message}`);
  const prompt = buildFixAllPrompt(code, hint, problems);
  const ask = (p: string) => askLLM(FIXALL_SYSTEM, p, { maxTokens: 3500, timeoutMs: 25000, signal });
  let { code: out, truncated } = clean(await ask(prompt), FIXALL_LINES, FIXALL_CHARS);
  if (!out) return { code: "" };
  let problem = parseProblem(out);
  if (problem) {
    const retry = clean(
      await ask(`${prompt}

Your previous answer failed to parse (${problem}):
<<<
${out}
>>>
Return a corrected, complete program.`),
      FIXALL_LINES,
      FIXALL_CHARS,
    );
    if (retry.code) ({ code: out, truncated } = retry);
    problem = parseProblem(out);
  }
  const warning = problem ? `AI fix may not compile: ${problem}` : truncated ? "AI fix was cut short (too long)" : undefined;
  return warning ? { code: out, warning } : { code: out };
}
