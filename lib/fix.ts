import { askLLM } from "./complete";

export const FIX_SYSTEM = `You are a friendly C tutor inside a learning tool. A student's program has a problem on one line.
Reply with ONLY a JSON object: {"explanation": string, "replacement": string}
- "explanation": 1-2 plain sentences telling the student what was wrong and why the fix works. No code fences.
- "replacement": the corrected text for that ONE line (keep its indentation, no trailing newline). It must replace the whole line.
Change as little as possible. Do not rewrite other lines.`;

export interface AiFix {
  explanation: string;
  replacement: string;
}

export function buildFixPrompt(code: string, line: number, message: string): string {
  const lines = code.split("\n");
  const from = Math.max(0, line - 6);
  const view = lines
    .slice(from, line + 4)
    .map((l, i) => `${from + i + 1}${from + i + 1 === line ? ">" : " "} ${l}`)
    .join("\n");
  return `Problem on line ${line}: ${message}\n\nCode (line ${line} is marked with >):\n${view}\n\nReturn the JSON.`;
}

/** Parse the model reply; returns null if it is unusable. Only a single-line replacement is accepted. */
export function parseFix(raw: string, original: string): AiFix | null {
  const a = raw.indexOf("{");
  const b = raw.lastIndexOf("}");
  if (a < 0 || b < a) return null;
  try {
    const j = JSON.parse(raw.slice(a, b + 1));
    if (typeof j.replacement !== "string") return null;
    const replacement = j.replacement.replace(/\r/g, "").replace(/\n+$/, "");
    if (!replacement.trim() || replacement.includes("\n") || replacement.length > 400 || replacement === original) return null;
    const explanation = typeof j.explanation === "string" ? j.explanation.trim().slice(0, 400) : "";
    return { explanation: explanation || "Updated the line to fix the error.", replacement };
  } catch {
    return null;
  }
}

export async function suggestFix(code: string, line: number, message: string, signal?: AbortSignal): Promise<AiFix | null> {
  const original = code.split("\n")[line - 1] ?? "";
  const raw = await askLLM(FIX_SYSTEM, buildFixPrompt(code, line, message), { maxTokens: 300, signal });
  return parseFix(raw, original);
}
