import { askLLM } from "./complete";

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
