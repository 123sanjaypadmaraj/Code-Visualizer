import { askLLM } from "./complete";
import { parseC } from "./c/parser";

export const GENERATE_SYSTEM = `You write C programs for students inside a C learning tool.
You receive a REQUEST and the CURRENT program (may be empty).
Reply with ONLY the complete C program that replaces the current one.
Rules:
- Plain C (C99), standard library only, with #include lines and main.
- If the REQUEST asks to change, fix or extend the CURRENT program, return the full updated program. Otherwise write a brand new program for the request and ignore the current one.
- Output raw code: no markdown fences, no explanations. Short comments inside the code are fine.
- Keep it simple and readable, as a good teacher would write it.`;

export function buildGeneratePrompt(request: string, before: string, after: string): string {
  return `REQUEST: ${request}

CURRENT PROGRAM:
<<<
${before}${after}
>>>

Write the complete program:`;
}

const MAX_CHARS = 4000;
const MAX_LINES = 120;

/** Turn a raw model reply into code to insert (or "" when unusable). */
export function cleanGenerated(raw: string): string {
  return clean(raw).code;
}

export function clean(raw: string, maxLines = MAX_LINES, maxChars = MAX_CHARS): { code: string; truncated: boolean } {
  let t = raw.replace(/\r/g, "");
  const fence = t.match(/```[a-zA-Z]*\n?([\s\S]*?)(```|$)/);
  if (fence) t = fence[1];
  t = t.replace(/^<<<\n?|\n?>>>$/g, "").replace(/<CURSOR>/g, "");
  const lines = t.split("\n");
  const truncated = lines.length > maxLines || t.length > maxChars;
  t = lines.slice(0, maxLines).join("\n").slice(0, maxChars);
  return { code: t.replace(/^\n+/, "").replace(/\s+$/, ""), truncated };
}

export interface Generated {
  code: string;
  /** set when the final program was cut short or does not parse */
  warning?: string;
}

export function parseProblem(code: string): string | null {
  try {
    parseC(code);
    return null;
  } catch (e) {
    const line = (e as { line?: number }).line;
    const msg = e instanceof Error ? e.message : "syntax error";
    return line ? `line ${line}: ${msg}` : msg;
  }
}

/** Generate a program; if it does not parse, ask the model once more with the parser error. */
export async function generateCode(request: string, before: string, after: string, signal?: AbortSignal): Promise<Generated> {
  const prompt = buildGeneratePrompt(request, before, after);
  const ask = (p: string) => askLLM(GENERATE_SYSTEM, p, { maxTokens: 1200, timeoutMs: 20000, signal });
  let { code, truncated } = clean(await ask(prompt));
  if (!code) return { code: "" };
  let problem = parseProblem(code);
  if (problem) {
    const retry = clean(
      await ask(`${prompt}

Your previous program failed to parse (${problem}):
<<<
${code}
>>>
Return a corrected, complete program.`),
    );
    if (retry.code) ({ code, truncated } = retry);
    problem = parseProblem(code);
  }
  const warning = problem ? `AI code may not compile: ${problem}` : truncated ? "AI code was cut short (too long)" : undefined;
  return warning ? { code, warning } : { code };
}
